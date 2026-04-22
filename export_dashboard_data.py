from __future__ import annotations

import json
from pathlib import Path

import duckdb
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "umaps.db"
OUTPUT_PATH = BASE_DIR / "docs" / "data" / "dashboard.json"


def clean_text(value: object) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


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
            elif pd.isna(value):
                clean_row[key] = None
            else:
                clean_row[key] = value
        records.append(clean_row)
    return records


def build_payload() -> dict:
    con = duckdb.connect(str(DB_PATH), read_only=True)

    scholars = con.execute("SELECT * FROM scholars").df()
    participations = con.execute("SELECT * FROM participations").df()
    con.close()

    scholars["country_of_origin"] = scholars["country_of_origin"].map(clean_text)
    scholars["institution_home"] = scholars["institution_home"].map(clean_text)

    participations["cohort_year"] = pd.to_numeric(participations["cohort_year"], errors="coerce").astype("Int64")
    participations["cohort_semester"] = participations["cohort_semester"].map(clean_text)
    participations["discipline_degree_incoming"] = participations["discipline_degree_incoming"].map(clean_text)
    participations["host_name_raw"] = participations["host_name_raw"].map(clean_text)

    view = participations.merge(scholars, on="scholar_id", how="left")
    view["full_name_raw"] = view["full_name_raw"].map(clean_text)
    view["email_primary"] = view["email_primary"].map(clean_text)

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

    country_counts = (
        scholars.dropna(subset=["country_of_origin"])
        .groupby("country_of_origin", as_index=False)
        .agg(scholars=("scholar_id", "nunique"))
        .sort_values(["scholars", "country_of_origin"], ascending=[False, True])
        .head(12)
    )

    institution_counts = (
        scholars.dropna(subset=["institution_home"])
        .groupby("institution_home", as_index=False)
        .agg(scholars=("scholar_id", "nunique"))
        .sort_values(["scholars", "institution_home"], ascending=[False, True])
        .head(12)
    )

    host_counts = (
        participations.dropna(subset=["host_name_raw"])
        .groupby("host_name_raw", as_index=False)
        .agg(participations=("participation_id", "nunique"))
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
                "email_primary",
                "country_of_origin",
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
                "email_primary": "email",
                "country_of_origin": "country",
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

    latest_count = 0
    if latest_year is not None:
        latest_count = int(view[view["cohort_year"] == latest_year]["scholar_id"].nunique())

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
            "latestCohort": {
                "year": latest_year,
                "scholars": latest_count,
            },
        },
        "series": {
            "cohorts": frame_to_records(cohort_counts),
            "topCountries": frame_to_records(country_counts),
            "topInstitutions": frame_to_records(institution_counts),
            "topHosts": frame_to_records(host_counts),
            "latestCohortCountries": frame_to_records(latest_cohort_countries),
        },
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
