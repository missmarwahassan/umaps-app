from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
SOURCE_PATH = BASE_DIR / "data" / "um-africa-engagement-map.xlsx"
OUTPUT_PATH = BASE_DIR / "docs" / "data" / "engagement.json"

AFRICA_COUNTRIES = {
    "Algeria",
    "Benin",
    "Botswana",
    "Burkina Faso",
    "Cameroon",
    "Congo",
    "Republic of the Congo",
    "Côte d'Ivoire",
    "Democratic Republic of the Congo",
    "Egypt",
    "Ethiopia",
    "Gabon",
    "Ghana",
    "Guinea",
    "Guinea-Bissau",
    "Kenya",
    "Lesotho",
    "Liberia",
    "Libya",
    "Madagascar",
    "Malawi",
    "Mali",
    "Mauritania",
    "Morocco",
    "Mozambique",
    "Namibia",
    "Niger",
    "Nigeria",
    "Rwanda",
    "Senegal",
    "South Africa",
    "Sudan",
    "Tanzania",
    "Togo",
    "Tunisia",
    "Uganda",
    "Zambia",
    "Zimbabwe",
}

COUNTRY_ALIASES = {
    "Cote d'Ivoire": "Côte d'Ivoire",
    "Democratic Republic of Congo": "Democratic Republic of the Congo",
    "Congo": "Republic of the Congo",
    "Guinea Bissau": "Guinea-Bissau",
}

REGIONAL_LABELS = {
    "Sub-Saharan Africa",
    "West and Central Africa",
    "Sahel",
}

PROJECT_TYPE_ALIASES = {
    "capacity building": "Capacity Building",
    "research": "Research",
    "researcg": "Research",
    "research capacity program": "Research Capacity Program",
    "teaching": "Teaching",
}

PROJECT_TYPE_KEYS = {
    "Research": "research",
    "Capacity Building": "capacity-building",
    "Teaching": "teaching",
    "Research Capacity Program": "research-capacity-program",
}


def clean_text(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).replace("\xa0", " ").strip()
    return text or None


def normalize_country(value: object) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    return COUNTRY_ALIASES.get(text, text)


def normalize_project_type(value: object) -> str:
    text = clean_text(value)
    if not text:
        return "Other"
    return PROJECT_TYPE_ALIASES.get(text.lower(), text)


def country_scope(country: str | None) -> str:
    if not country:
        return "unknown"
    if country in REGIONAL_LABELS or "," in country:
        return "regional"
    if country in AFRICA_COUNTRIES:
        return "country"
    return "regional"


def frame_to_records(frame: pd.DataFrame) -> list[dict]:
    rows: list[dict] = []
    for row in frame.to_dict(orient="records"):
        clean_row: dict[str, object] = {}
        for key, value in row.items():
            if isinstance(value, pd.Timestamp):
                clean_row[key] = value.isoformat()
            elif isinstance(value, list):
                clean_row[key] = value
            elif pd.isna(value):
                clean_row[key] = None
            else:
                clean_row[key] = value
        rows.append(clean_row)
    return rows


def build_payload() -> dict:
    if not SOURCE_PATH.exists():
        raise FileNotFoundError(f"Source workbook not found: {SOURCE_PATH}")

    frame = pd.read_excel(SOURCE_PATH, sheet_name="Projects & Collaborations")
    frame = frame.rename(columns={"U-M College Affiliation ": "U-M College Affiliation"})

    for column in frame.columns:
        if frame[column].dtype == object:
            frame[column] = frame[column].map(clean_text)

    frame["Project Type"] = frame["Project Type"].map(normalize_project_type)
    frame["Country"] = frame["Country"].map(normalize_country)
    frame["countryScope"] = frame["Country"].map(country_scope)
    frame["mapCountry"] = frame.apply(
        lambda row: row["Country"] if row["countryScope"] == "country" else None,
        axis=1,
    )
    frame["projectTypeKey"] = frame["Project Type"].map(lambda value: PROJECT_TYPE_KEYS.get(value, "other"))
    frame["projectNo"] = frame["Project No."].map(lambda value: int(value) if pd.notna(value) else None)

    records = (
        frame[
            [
                "projectNo",
                "Project Title",
                "PI Name",
                "Career",
                "Collaborators",
                "Project Description",
                "Project Type",
                "projectTypeKey",
                "Country",
                "countryScope",
                "mapCountry",
                "City",
                "U-M College Affiliation",
                "Funding Source",
                "Funding Duration",
            ]
        ]
        .rename(
            columns={
                "Project Title": "projectTitle",
                "PI Name": "piName",
                "Career": "career",
                "Collaborators": "collaborators",
                "Project Description": "projectDescription",
                "Project Type": "projectType",
                "Country": "country",
                "City": "city",
                "U-M College Affiliation": "college",
                "Funding Source": "fundingSource",
                "Funding Duration": "fundingDuration",
            }
        )
        .sort_values(["country", "college", "projectTitle"], na_position="last")
    )

    top_countries = (
        frame.dropna(subset=["mapCountry"])
        .groupby("mapCountry", as_index=False)
        .agg(projects=("projectNo", "count"))
        .sort_values(["projects", "mapCountry"], ascending=[False, True])
        .head(12)
        .rename(columns={"mapCountry": "country"})
    )

    top_colleges = (
        frame.groupby("U-M College Affiliation", as_index=False)
        .agg(projects=("projectNo", "count"))
        .sort_values(["projects", "U-M College Affiliation"], ascending=[False, True])
        .head(12)
        .rename(columns={"U-M College Affiliation": "college"})
    )

    project_types = (
        frame.groupby(["projectTypeKey", "Project Type"], as_index=False)
        .agg(projects=("projectNo", "count"))
        .sort_values(["projects", "Project Type"], ascending=[False, True])
        .rename(columns={"Project Type": "projectType"})
    )

    return {
        "generatedAt": pd.Timestamp.utcnow().isoformat(),
        "metrics": {
            "totalProjects": int(len(frame)),
            "mappableProjects": int(frame["mapCountry"].notna().sum()),
            "countries": int(frame["mapCountry"].dropna().nunique()),
            "colleges": int(frame["U-M College Affiliation"].dropna().nunique()),
            "projectTypes": int(frame["Project Type"].dropna().nunique()),
            "regionalProjects": int((frame["countryScope"] == "regional").sum()),
        },
        "series": {
            "topCountries": frame_to_records(top_countries),
            "topColleges": frame_to_records(top_colleges),
            "projectTypes": frame_to_records(project_types),
        },
        "records": frame_to_records(records),
    }


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = build_payload()
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote engagement data to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
