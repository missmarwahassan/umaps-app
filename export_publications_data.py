from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

import duckdb
import pandas as pd
from rapidfuzz import fuzz, process

BASE_DIR = Path(__file__).resolve().parent
ALUMNI_PATH = BASE_DIR / "data" / "UMAPS Alumni Data-3.xlsx"
DB_PATH = BASE_DIR / "umaps.db"
OUTPUT_PATH = BASE_DIR / "docs" / "data" / "publications.json"

BASE_SHEETS = {
    "ALL ONGOING",
    "Numbers for Infographic",
    "Current cohort",
    "PhD updates",
    "Books",
    "Promotions",
    "Awards",
    "Moody Scholars",
    "Ghana by Uni",
    "So Africa by Uni",
    "Liberia by Uni",
    "Uganda by Uni",
    "Ethiopia by Uni",
    "Other by Uni",
    "Distribution by University",
    "UMAPS Unis LIST",
}

PUBLICATION_SOURCE_COLUMNS = {
    "post-UMAPS publications updated thru Google Scholar HF Apr 2021 --> Seperate workbook sheet for those w/ 8+ pubs": "Post-UMAPS",
    "more post-UMAPS publications": "Post-UMAPS",
    "pre-UMAPS publications (based on CVs submitted w/UMAPS application: available on Ctools and compiled here by HF, May-June 2017)": "Pre-UMAPS",
    "publications unclear/to be checked": "Needs review",
}

SHEET_CATEGORY_MAP = {
    "books (monograph)": "Book",
    "books (monographs)": "Book",
    "book contribution (editorial volume)": "Book Chapter",
    "book contributions (editorial volume)": "Book Chapter",
    "peer-reviewed article": "Peer-Reviewed Article",
    "peer-reviewed articles": "Peer-Reviewed Article",
    "non-peer reviewed article": "Non-Peer-Reviewed Article",
    "non-peer reviewed articles": "Non-Peer-Reviewed Article",
    "peer reviewed status unknown articles": "Status Unknown",
}

TYPE_COLOR_ORDER = [
    "Book",
    "Book Chapter",
    "Peer-Reviewed Article",
    "Non-Peer-Reviewed Article",
    "Status Unknown",
    "Publication",
]


def clean_text(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def normalize_ascii(value: object) -> str:
    text = clean_text(value) or ""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return text


def normalize_name(value: object) -> str:
    text = normalize_ascii(value).lower()
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_header(value: object) -> str:
    return re.sub(r"\s+", " ", str(value)).strip().lower()


def make_id(prefix: str, seed: str) -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:14]
    return f"{prefix}-{digest}"


def to_int(value: object) -> int | None:
    if value is None or pd.isna(value):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def clean_citation_text(value: object) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    lower = text.lower()
    if "see named workbook sheet" in lower:
        return None
    if lower in {"nan", "none"}:
        return None
    return text.replace("§", " ").strip()


def split_citations(text: str | None) -> list[str]:
    if not text:
        return []

    normalized = text.replace("\r", "\n").replace("\u2022", "\n")
    normalized = re.sub(r"\n{2,}", "\n", normalized)
    normalized = re.sub(r"(?m)^\s*[-*]\s*", "", normalized)
    normalized = re.sub(r"(?<!\d)\s+(\d{1,2}\.)\s+(?=[A-Z“\"(])", r"\n\1 ", normalized)

    pieces = re.split(r"(?:^|\n)\s*(?:\d{1,2}|[A-Za-z])[\.\)]\s*", normalized)
    entries = []
    for piece in pieces:
        citation = clean_text(piece)
        if not citation:
            continue
        citation = re.sub(r"\s*;\s*$", "", citation)
        if citation.lower() in {"no publications", "no academic publications"}:
            continue
        if len(citation) < 12:
            continue
        entries.append(citation)

    if not entries:
        cleaned = clean_citation_text(normalized)
        return [cleaned] if cleaned and "no publications" not in cleaned.lower() else []
    return entries


def extract_year(citation: str) -> int | None:
    match = re.search(r"(19|20)\d{2}", citation)
    if match:
        return int(match.group())
    return None


def extract_title(citation: str) -> str:
    quote_match = re.search(r"[\"“”']([^\"“”']{8,220})[\"“”']", citation)
    if quote_match:
        return quote_match.group(1).strip()

    year_dot_match = re.search(r"(?:19|20)\d{2}[^A-Za-z0-9]{0,4}\s*([^\.]{8,220})\.", citation)
    if year_dot_match:
        candidate = year_dot_match.group(1).strip(" ,:;")
        if candidate:
            return candidate

    in_match = re.search(r"\.\s*([^\.]{8,220})\.\s*In\b", citation)
    if in_match:
        return in_match.group(1).strip(" ,:;")

    candidate = citation.split(".")[0]
    if len(candidate) > 100:
        candidate = citation[:100]
    return candidate.strip(" ,:;")


def infer_publication_type(citation: str, declared_type: str | None = None) -> str:
    if declared_type:
        return declared_type

    lower = citation.lower()
    if " in " in lower and (" ed" in lower or "(eds" in lower):
        return "Book Chapter"
    if any(keyword in lower for keyword in ["journal", "review", "quarterly", "studies", "letters", "heliyon", "bmc "]):
        return "Peer-Reviewed Article"
    if any(keyword in lower for keyword in [" press", "routledge", "springer", "palgrave", "praeger", "publisher"]):
        return "Book"
    return "Publication"


def citation_key(citation: str) -> str:
    normalized = normalize_ascii(citation).lower()
    normalized = re.sub(r"[^a-z0-9]+", "", normalized)
    return normalized


def build_dashboard_lookup() -> tuple[dict[str, str], dict[str, str]]:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    scholars = con.execute(
        """
        SELECT
          s.scholar_id,
          s.email_primary,
          s.full_name_raw,
          p.cohort_year
        FROM scholars s
        LEFT JOIN participations p USING (scholar_id)
        """
    ).df()
    con.close()

    by_email: dict[str, str] = {}
    by_name_year: dict[str, str] = {}
    for row in scholars.to_dict(orient="records"):
        email = clean_text(row.get("email_primary"))
        name = normalize_name(row.get("full_name_raw"))
        year = to_int(row.get("cohort_year"))
        scholar_id = row["scholar_id"]
        if email and email not in by_email:
            by_email[email.lower()] = scholar_id
        if name and year is not None:
            key = f"{name}|{year}"
            by_name_year.setdefault(key, scholar_id)
    return by_email, by_name_year


def build_scholar_rows() -> tuple[pd.DataFrame, dict[str, dict]]:
    frame = pd.read_excel(ALUMNI_PATH, sheet_name="ALL ONGOING")
    frame.columns = [re.sub(r"\s+", " ", str(column)).strip() for column in frame.columns]

    frame = frame.rename(
        columns={
            "Last name": "last_name",
            "Last name ": "last_name",
            " Last name": "last_name",
            "First name": "first_name",
            "Institution": "institution",
            "country": "country",
            "Gender": "gender",
            "Cohort": "cohort",
            "Cohort ": "cohort",
            "Cohort  ": "cohort",
            "Permanent Email": "email",
            "# post-UMAPS books": "reported_books",
            "# post-UMAPS book chapters": "reported_book_chapters",
            "# post-UMAPS peer-reviewed articles": "reported_peer_reviewed_articles",
        }
    )

    frame["first_name"] = frame["first_name"].map(clean_text)
    frame["last_name"] = frame["last_name"].map(clean_text)
    frame["email"] = frame["email"].map(clean_text)
    frame["institution"] = frame["institution"].map(clean_text)
    frame["country"] = frame["country"].map(clean_text)
    frame["gender"] = frame["gender"].map(clean_text)
    frame["cohort_raw"] = frame["cohort"].map(clean_text)
    frame["cohortYear"] = frame["cohort_raw"].str.extract(r"((?:19|20)\d{2})")[0].map(to_int)
    frame["semester"] = frame["cohort_raw"].fillna("").str.extract(r"(Fall|Winter)", flags=re.IGNORECASE)[0].str.title()
    frame["name"] = (
        frame["first_name"].fillna("").astype(str).str.strip()
        + " "
        + frame["last_name"].fillna("").astype(str).str.strip()
    ).str.strip()
    frame["nameKey"] = frame["name"].map(normalize_name)
    frame["scholarUid"] = frame.apply(
        lambda row: make_id(
            "scholar",
            (row["email"] or f"{row['nameKey']}|{row['cohortYear'] or 'unknown'}").lower(),
        ),
        axis=1,
    )

    email_lookup, name_year_lookup = build_dashboard_lookup()

    def dashboard_id(row: pd.Series) -> str | None:
        email = clean_text(row["email"])
        if email and email.lower() in email_lookup:
            return email_lookup[email.lower()]
        year = row["cohortYear"]
        if row["nameKey"] and year is not None:
            return name_year_lookup.get(f"{row['nameKey']}|{year}")
        return None

    frame["dashboardScholarId"] = frame.apply(dashboard_id, axis=1)

    scholar_index = {
        row["scholarUid"]: {
            "scholarUid": row["scholarUid"],
            "dashboardScholarId": clean_text(row["dashboardScholarId"]),
            "name": row["name"],
            "country": clean_text(row["country"]),
            "gender": clean_text(row["gender"]),
            "institution": clean_text(row["institution"]),
            "cohortYear": row["cohortYear"],
            "semester": clean_text(row["semester"]),
            "reportedBooks": to_int(row.get("reported_books")),
            "reportedBookChapters": to_int(row.get("reported_book_chapters")),
            "reportedPeerReviewedArticles": to_int(row.get("reported_peer_reviewed_articles")),
        }
        for row in frame.to_dict(orient="records")
        if row["name"]
    }

    return frame, scholar_index


def match_sheet_to_scholar(sheet_name: str, scholar_label: str | None, scholars: pd.DataFrame) -> dict | None:
    candidates = scholars.dropna(subset=["name"]).copy()
    choices = {row["scholarUid"]: row["name"] for row in candidates.to_dict(orient="records")}
    query = normalize_name(scholar_label or sheet_name.replace(",", " "))
    if not query:
        return None

    key_lookup = {row["scholarUid"]: row for row in candidates.to_dict(orient="records")}
    result = process.extractOne(
        query,
        {uid: normalize_name(name) for uid, name in choices.items()},
        scorer=fuzz.token_sort_ratio,
    )
    if not result or result[1] < 70:
        return None
    return key_lookup[result[2]]


def append_publication(
    records: list[dict],
    scholar: dict,
    citation: str,
    stage: str,
    source: str,
    declared_type: str | None = None,
) -> None:
    cleaned = clean_citation_text(citation)
    if not cleaned:
        return
    lower = cleaned.lower()
    if "no publications" in lower and "conference" not in lower:
        return

    publication_type = infer_publication_type(cleaned, declared_type)
    title = extract_title(cleaned)
    year = extract_year(cleaned)
    records.append(
        {
            "scholarUid": scholar["scholarUid"],
            "dashboardScholarId": scholar.get("dashboardScholarId"),
            "scholarName": scholar["name"],
            "country": scholar.get("country"),
            "institution": scholar.get("institution"),
            "cohortYear": scholar.get("cohortYear"),
            "semester": scholar.get("semester"),
            "stage": stage,
            "publicationType": publication_type,
            "title": title,
            "year": year,
            "citation": cleaned,
            "citationKey": citation_key(cleaned),
            "source": source,
        }
    )


def parse_scholar_sheets(alumni: pd.DataFrame) -> list[dict]:
    workbook = pd.ExcelFile(ALUMNI_PATH)
    records: list[dict] = []
    scholar_sheets = [sheet for sheet in workbook.sheet_names if sheet not in BASE_SHEETS]

    for sheet_name in scholar_sheets:
        frame = pd.read_excel(ALUMNI_PATH, sheet_name=sheet_name)
        if frame.empty:
            continue
        row = frame.iloc[0].to_dict()
        scholar = match_sheet_to_scholar(sheet_name, row.get("Scholar's Name") or row.get("Scholar’s Name"), alumni)
        if not scholar:
            continue

        normalized = {normalize_header(column): clean_citation_text(value) for column, value in row.items()}
        for raw_column, value in normalized.items():
            if not value or raw_column.startswith("unnamed"):
                continue
            if raw_column in {"scholar's name", "scholar’s name"}:
                continue
            declared_type = SHEET_CATEGORY_MAP.get(raw_column)
            if not declared_type:
                continue
            for citation in split_citations(value):
                append_publication(
                    records,
                    scholar,
                    citation,
                    stage="Post-UMAPS",
                    source=f"Scholar sheet: {sheet_name.strip()}",
                    declared_type=declared_type,
                )
    return records


def parse_main_sheet(alumni: pd.DataFrame) -> list[dict]:
    records: list[dict] = []
    for row in alumni.to_dict(orient="records"):
        scholar = {
            "scholarUid": row["scholarUid"],
            "dashboardScholarId": row["dashboardScholarId"],
            "name": row["name"],
            "country": row["country"],
            "institution": row["institution"],
            "cohortYear": row["cohortYear"],
            "semester": row["semester"],
        }
        for column, stage in PUBLICATION_SOURCE_COLUMNS.items():
            value = clean_citation_text(row.get(column))
            if not value:
                continue
            for citation in split_citations(value):
                append_publication(
                    records,
                    scholar,
                    citation,
                    stage=stage,
                    source=f"ALL ONGOING: {column}",
                )
    return records


def dedupe_records(records: list[dict]) -> list[dict]:
    seen: set[str] = set()
    unique: list[dict] = []
    for record in records:
        key = f"{record['scholarUid']}|{record['citationKey']}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(record)
    return unique


def frame_to_records(frame: pd.DataFrame) -> list[dict]:
    rows: list[dict] = []
    for row in frame.to_dict(orient="records"):
        clean_row = {}
        for key, value in row.items():
            if pd.isna(value):
                clean_row[key] = None
            else:
                clean_row[key] = value
        rows.append(clean_row)
    return rows


def build_payload() -> dict:
    alumni, scholar_index = build_scholar_rows()
    sheet_records = parse_scholar_sheets(alumni)
    main_records = parse_main_sheet(alumni)
    all_records = dedupe_records(sheet_records + main_records)

    publications_by_key: dict[str, dict] = {}
    for record in all_records:
        publication_id = make_id("pub", record["citationKey"])
        node = publications_by_key.setdefault(
            publication_id,
            {
                "publicationId": publication_id,
                "citationKey": record["citationKey"],
                "title": record["title"],
                "citation": record["citation"],
                "year": record["year"],
                "publicationType": record["publicationType"],
                "stage": record["stage"],
                "source": record["source"],
                "scholarUids": [],
                "scholarNames": [],
                "countries": [],
                "institutions": [],
                "cohorts": [],
            },
        )
        node["scholarUids"].append(record["scholarUid"])
        node["scholarNames"].append(record["scholarName"])
        if record["country"]:
            node["countries"].append(record["country"])
        if record["institution"]:
            node["institutions"].append(record["institution"])
        if record["cohortYear"] is not None:
            node["cohorts"].append(int(record["cohortYear"]))

    publications = []
    for node in publications_by_key.values():
        node["scholarUids"] = sorted(set(node["scholarUids"]))
        node["scholarNames"] = sorted(set(node["scholarNames"]))
        node["countries"] = sorted(set(node["countries"]))
        node["institutions"] = sorted(set(node["institutions"]))
        node["cohorts"] = sorted(set(node["cohorts"]))
        publications.append(node)

    scholar_counts: dict[str, int] = {}
    for record in all_records:
        scholar_counts[record["scholarUid"]] = scholar_counts.get(record["scholarUid"], 0) + 1

    scholars = []
    for scholar_uid, scholar in scholar_index.items():
        count = scholar_counts.get(scholar_uid, 0)
        if count == 0:
            continue
        post_count = sum(1 for record in all_records if record["scholarUid"] == scholar_uid and record["stage"] == "Post-UMAPS")
        scholars.append(
            {
                **scholar,
                "publicationCount": count,
                "postUmapsCount": post_count,
            }
        )

    records_frame = pd.DataFrame(all_records)
    publications_frame = pd.DataFrame(publications)
    scholars_frame = pd.DataFrame(scholars)

    by_type = (
        records_frame.groupby("publicationType", dropna=False)
        .size()
        .reset_index(name="count")
        .sort_values(["count", "publicationType"], ascending=[False, True])
    )

    by_stage = (
        records_frame.groupby("stage", dropna=False)
        .size()
        .reset_index(name="count")
        .sort_values(["count", "stage"], ascending=[False, True])
    )

    by_year = (
        records_frame.dropna(subset=["year"])
        .groupby("year", as_index=False)
        .size()
        .rename(columns={"size": "count"})
        .sort_values("year")
    )

    top_scholars = (
        scholars_frame[["name", "country", "institution", "cohortYear", "publicationCount", "postUmapsCount"]]
        .sort_values(["publicationCount", "name"], ascending=[False, True])
        .head(20)
    )

    shared_publications = int(sum(1 for publication in publications if len(publication["scholarUids"]) > 1))

    payload = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "metrics": {
            "scholarsWithPublications": int(len(scholars)),
            "parsedPublications": int(len(all_records)),
            "uniquePublicationNodes": int(len(publications)),
            "postUmapsPublications": int((records_frame["stage"] == "Post-UMAPS").sum()),
            "countriesRepresented": int(scholars_frame["country"].dropna().nunique()) if not scholars_frame.empty else 0,
            "sharedPublications": shared_publications,
        },
        "series": {
            "byType": frame_to_records(by_type),
            "byStage": frame_to_records(by_stage),
            "byYear": frame_to_records(by_year),
            "topScholars": frame_to_records(top_scholars),
            "typeOrder": TYPE_COLOR_ORDER,
        },
        "scholars": scholars,
        "publications": publications,
        "records": all_records,
        "note": (
            "This publication view is built from the maintained UMAPS alumni workbook, including publication count fields, "
            "free-text publication lists, and dedicated scholar-specific publication sheets. It reflects what is currently "
            "recorded in that workbook and may not yet capture every publication for every alumnus."
        ),
    }
    return payload


def main() -> None:
    payload = build_payload()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f"Wrote {OUTPUT_PATH}")
    print(
        f"Scholars with publications: {payload['metrics']['scholarsWithPublications']:,} | "
        f"Parsed publication records: {payload['metrics']['parsedPublications']:,} | "
        f"Unique publication nodes: {payload['metrics']['uniquePublicationNodes']:,}"
    )


if __name__ == "__main__":
    main()
