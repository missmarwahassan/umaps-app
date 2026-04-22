from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "umaps.db"
QUALTRICS_PATH = BASE_DIR / "data" / "UMAPS Alumni_February 28, 2026_22.02.xlsx"
OUTPUT_PATH = BASE_DIR / "docs" / "data" / "dashboard.json"

COUNTRY_ALIASES = {
    "Tanzania, United Republic of": "Tanzania",
    "Cote d’Ivoire": "Côte d'Ivoire",
    "Cote d'Ivoire": "Côte d'Ivoire",
    "Ethiopian": "Ethiopia",
    "DRC": "Democratic Republic of the Congo",
}


def clean_text(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def normalize_country(value: object) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    return COUNTRY_ALIASES.get(text, text)


def normalize_gender(value: object) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    text = text.strip().lower().replace("(", "").replace(")", "")
    if text == "f":
        return "Female"
    if text == "m":
        return "Male"
    return text.title()


def normalize_semester(value: object, cohort_year: object) -> str | None:
    text = clean_text(value)
    year = to_int(cohort_year)
    if text:
        normalized = text.title()
        if normalized in {"Fall", "Winter", "Annual"}:
            return normalized
        return normalized
    if year is None:
        return None
    if year <= 2019:
        return "Annual"
    if year == 2021:
        return "Fall"
    return None


def semester_sort_value(value: object) -> int:
    normalized = clean_text(value)
    order = {"Annual": 0, "Winter": 1, "Fall": 2}
    return order.get(normalized, -1)


def to_int(value: object) -> int | None:
    if value is None or pd.isna(value):
        return None
    return int(value)


def frame_to_records(frame: pd.DataFrame) -> list[dict]:
    records: list[dict] = []
    for row in frame.to_dict(orient="records"):
        clean_row = {}
        for key, value in row.items():
            if isinstance(value, pd.Timestamp):
                clean_row[key] = value.isoformat()
            elif isinstance(value, list):
                clean_row[key] = value
            elif pd.isna(value):
                clean_row[key] = None
            elif isinstance(value, (pd.Int64Dtype, pd.Float64Dtype)):
                clean_row[key] = value
            else:
                clean_row[key] = value
        records.append(clean_row)
    return records


def summarize_question(frame: pd.DataFrame, key: str, label: str) -> dict:
    values = pd.to_numeric(frame[key], errors="coerce").dropna()
    max_score = int(values.max()) if not values.empty else None
    top_count = int((values == max_score).sum()) if max_score is not None else 0
    average = round(float(values.mean()), 2) if not values.empty else None
    return {
        "key": key,
        "label": label,
        "average": average,
        "count": int(values.count()),
        "maxScore": max_score,
        "topScoreCount": top_count,
        "topScoreShare": round((top_count / len(values)) * 100, 1) if len(values) else None,
    }


def build_survey_payload() -> dict:
    raw = pd.read_excel(QUALTRICS_PATH)
    question_labels = raw.iloc[0].to_dict()
    survey = raw.iloc[1:].copy()

    survey["Finished"] = pd.to_numeric(survey["Finished"], errors="coerce")
    survey["Progress"] = pd.to_numeric(survey["Progress"], errors="coerce")
    survey["RecordedDate"] = pd.to_datetime(survey["RecordedDate"], errors="coerce")
    survey["DistributionChannel"] = survey["DistributionChannel"].map(clean_text)

    usable = survey[(survey["Finished"] == 1) & (survey["DistributionChannel"] != "test")].copy()

    response_timeline = (
        usable.dropna(subset=["RecordedDate"])
        .assign(month=lambda df: df["RecordedDate"].dt.to_period("M").astype(str))
        .groupby("month", as_index=False)
        .size()
        .rename(columns={"size": "responses"})
    )

    impact_keys = ["Q21_1", "Q21_2", "Q21_3"]
    opportunity_keys = ["Q22_1", "Q22_2", "Q22_3", "Q22_4"]

    impact_questions = [
        summarize_question(usable, key, str(question_labels.get(key, key))) for key in impact_keys
    ]
    opportunity_questions = [
        summarize_question(usable, key, str(question_labels.get(key, key))) for key in opportunity_keys
    ]

    return {
        "overview": {
            "totalResponses": int(len(survey)),
            "completedResponses": int((survey["Finished"] == 1).sum()),
            "usableResponses": int(len(usable)),
            "averageProgress": round(float(survey["Progress"].dropna().mean()), 1),
        },
        "responseTimeline": frame_to_records(response_timeline),
        "impactQuestions": impact_questions,
        "opportunityQuestions": opportunity_questions,
        "note": (
            "The export preserves question text, but not all qualitative scale labels for coded response items. "
            "This page therefore reports average score out of the highest observed score and the share of respondents "
            "who selected that highest score in the cleaned export."
        ),
    }


def build_payload() -> dict:
    con = duckdb.connect(str(DB_PATH), read_only=True)
    scholars = con.execute("SELECT * FROM scholars").df()
    participations = con.execute("SELECT * FROM participations").df()
    con.close()

    scholars["country_of_origin"] = scholars["country_of_origin"].map(normalize_country)
    scholars["institution_home"] = scholars["institution_home"].map(clean_text)
    scholars["gender"] = scholars["gender"].map(normalize_gender)

    participations["cohort_year"] = pd.to_numeric(participations["cohort_year"], errors="coerce").astype("Int64")
    participations["cohort_semester"] = participations.apply(
        lambda row: normalize_semester(row["cohort_semester"], row["cohort_year"]), axis=1
    )
    participations["discipline_degree_incoming"] = participations["discipline_degree_incoming"].map(clean_text)
    participations["host_name_raw"] = participations["host_name_raw"].map(clean_text)

    view = participations.merge(scholars, on="scholar_id", how="left")
    view["full_name_raw"] = view["full_name_raw"].map(clean_text)
    valid_years = view["cohort_year"].dropna().astype(int)
    latest_year = int(valid_years.max()) if not valid_years.empty else None

    cohort_counts = (
        view.dropna(subset=["cohort_year"])
        .groupby("cohort_year", as_index=False)
        .agg(
            scholars=("scholar_id", "nunique"),
            participations=("participation_id", "nunique"),
        )
        .sort_values("cohort_year")
    )
    cohort_counts["cohort_year"] = cohort_counts["cohort_year"].astype(int)

    geography_timeline = (
        view.dropna(subset=["cohort_year", "country_of_origin"])
        .groupby(["cohort_year", "country_of_origin"], as_index=False)
        .agg(scholars=("scholar_id", "nunique"))
        .sort_values(["cohort_year", "country_of_origin"])
    )
    geography_timeline["cohort_year"] = geography_timeline["cohort_year"].astype(int)

    country_counts = (
        scholars.dropna(subset=["country_of_origin"])
        .groupby("country_of_origin", as_index=False)
        .agg(scholars=("scholar_id", "nunique"))
        .sort_values(["scholars", "country_of_origin"], ascending=[False, True])
        .head(12)
    )

    institution_counts = (
        view.dropna(subset=["institution_home", "cohort_year"])
        .groupby("institution_home", as_index=False)
        .agg(
            scholars=("scholar_id", "nunique"),
            firstYear=("cohort_year", "min"),
        )
        .sort_values(["scholars", "institution_home"], ascending=[False, True])
        .head(12)
    )
    institution_counts["firstYear"] = institution_counts["firstYear"].map(to_int)

    host_counts = (
        view.dropna(subset=["host_name_raw", "cohort_year"])
        .groupby("host_name_raw", as_index=False)
        .agg(
            participations=("participation_id", "nunique"),
            hostYears=(
                "cohort_year",
                lambda years: [
                    {
                        "year": int(year),
                        "count": int(count),
                    }
                    for year, count in sorted(years.dropna().astype(int).value_counts().sort_index().items())
                ],
            ),
        )
        .sort_values(["participations", "host_name_raw"], ascending=[False, True])
        .head(12)
    )

    latest_cohort_countries = pd.DataFrame(columns=["country_of_origin", "scholars"])
    if latest_year is not None:
        latest_cohort_countries = (
            view[view["cohort_year"] == latest_year]
            .dropna(subset=["country_of_origin"])
            .groupby("country_of_origin", as_index=False)
            .agg(scholars=("scholar_id", "nunique"))
            .sort_values(["scholars", "country_of_origin"], ascending=[False, True])
            .head(10)
        )

    records = (
        view[
            [
                "scholar_id",
                "full_name_raw",
                "country_of_origin",
                "gender",
                "institution_home",
                "cohort_year",
                "cohort_semester",
                "discipline_degree_incoming",
                "host_name_raw",
            ]
        ]
        .rename(
            columns={
                "full_name_raw": "name",
                "country_of_origin": "country",
                "gender": "gender",
                "institution_home": "institution",
                "cohort_year": "cohortYear",
                "cohort_semester": "semester",
                "discipline_degree_incoming": "discipline",
                "host_name_raw": "host",
            }
        )
        .sort_values(["cohortYear", "name"], ascending=[False, True], na_position="last")
    )
    records["cohortYear"] = records["cohortYear"].map(to_int)

    latest_cohort_record = None
    cohort_records = view.dropna(subset=["cohort_year", "cohort_semester"]).copy()
    if not cohort_records.empty:
        cohort_records["semesterOrder"] = cohort_records["cohort_semester"].map(semester_sort_value)
        latest_row = cohort_records.sort_values(["cohort_year", "semesterOrder"]).iloc[-1]
        latest_year = to_int(latest_row["cohort_year"])
        latest_term = latest_row["cohort_semester"]
        latest_count = int(
            cohort_records[
                (cohort_records["cohort_year"] == latest_row["cohort_year"])
                & (cohort_records["cohort_semester"] == latest_row["cohort_semester"])
            ]["scholar_id"].nunique()
        )
        latest_cohort_record = {
            "year": latest_year,
            "term": latest_term,
            "label": f"{latest_term} {latest_year}",
            "scholars": latest_count,
        }

    payload = {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "metrics": {
            "uniqueScholars": int(scholars["scholar_id"].nunique()),
            "participations": int(participations["participation_id"].nunique()),
            "countries": int(scholars["country_of_origin"].dropna().nunique()),
            "institutions": int(scholars["institution_home"].dropna().nunique()),
            "hosts": int(participations["host_name_raw"].dropna().nunique()),
            "yearRange": {
                "start": int(valid_years.min()) if not valid_years.empty else None,
                "end": latest_year,
            },
            "latestCohort": latest_cohort_record
            or {
                "year": latest_year,
                "term": None,
                "label": f"{latest_year}" if latest_year else "No cohort yet",
                "scholars": int(view[view["cohort_year"] == latest_year]["scholar_id"].nunique()) if latest_year else 0,
            },
        },
        "series": {
            "cohorts": frame_to_records(cohort_counts),
            "geographyTimeline": frame_to_records(geography_timeline),
            "topCountries": frame_to_records(country_counts),
            "topInstitutions": frame_to_records(institution_counts),
            "topHosts": frame_to_records(host_counts),
            "latestCohortCountries": frame_to_records(latest_cohort_countries),
        },
        "survey": build_survey_payload(),
        "records": frame_to_records(records),
    }
    return payload


def main() -> None:
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database file not found: {DB_PATH}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = build_payload()
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote dashboard data to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
