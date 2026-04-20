# build_db.py
import re
import uuid
import pandas as pd
import duckdb
import pycountry

ALUMNI_XLSX = "data/UMAPS Alumni Data-3.xlsx"
QUALTRICS_XLSX = "data/UMAPS Alumni_February 28, 2026_22.02.xlsx"
DB_PATH = "umaps.db"


def norm_whitespace(x):
    if pd.isna(x):
        return None
    return re.sub(r"\s+", " ", str(x)).strip()


def clean_email(x):
    x = norm_whitespace(x)
    if not x:
        return None
    x = x.lower()
    return x if "@" in x else None


def clean_name(x):
    x = norm_whitespace(x)
    if not x:
        return None
    x = x.lower()
    x = re.sub(r"[^a-z\s'-]", "", x)
    x = re.sub(r"\s+", " ", x).strip()
    return x

def extract_cohort_year(x):
    x = norm_whitespace(x)
    if not x:
        return None

    s = str(x)

    # Find first 4-digit year like 2024
    match = re.search(r"(19|20)\d{2}", s)
    if match:
        return int(match.group())

    return None


def extract_cohort_semester(x):
    x = norm_whitespace(x)
    if not x:
        return None

    s = str(x).lower()

    if "fall" in s:
        return "Fall"
    if "winter" in s:
        return "Winter"
    if "both" in s or ("fall" in s and "winter" in s):
        return "Both"

    return None
    
    
def standardize_country(name):
    name = norm_whitespace(name)
    if not name:
        return None
    # Light normalization
    aliases = {
        "usa": "United States",
        "u.s.": "United States",
        "u.s.a.": "United States",
        "uk": "United Kingdom",
        "u.k.": "United Kingdom",
    }
    key = name.lower()
    if key in aliases:
        return aliases[key]
    # try pycountry lookup
    try:
        match = pycountry.countries.lookup(name)
        return match.name
    except Exception:
        return name  # keep as-is if not found


def main():
    # --- Alumni (ALL ONGOING) ---
    alumni = pd.read_excel(ALUMNI_XLSX, sheet_name="ALL ONGOING")

    # Normalize headers: strip + collapse whitespace (keeps original capitalization)
    alumni.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in alumni.columns]

    # Map columns (now matches your file)
    col = {
        "First name": "first_name",
        "Last name": "last_name",
        "Institution": "institution_home",
        "country": "country_of_origin",
        "Gender": "gender",
        "Permanent Email": "email_primary",
        "Phone #": "phone",
        "Cohort": "cohort_year",
        "Discipline/Degree (incoming)": "discipline_degree_incoming",
        "Mentor / U-M host": "host_name_raw",
        "mentor/hosts comments/ updates": "host_comments_raw",
    }
    alumni = alumni.rename(columns=col)

    # Guardrail: required columns must exist now
    required = ["first_name", "last_name", "cohort_year"]
    missing = [c for c in required if c not in alumni.columns]
    if missing:
        raise KeyError(f"Missing columns after rename: {missing}. Available: {alumni.columns.tolist()}")

    # Clean fields
    alumni["first_name"] = alumni["first_name"].map(norm_whitespace)
    alumni["last_name"] = alumni["last_name"].map(norm_whitespace)
    alumni["full_name_raw"] = (
        alumni.get("first_name").fillna("").astype(str).str.strip()
        + " "
        + alumni.get("last_name").fillna("").astype(str).str.strip()
    ).str.strip()

    alumni["email_primary"] = alumni.get("email_primary").map(clean_email)
    alumni["gender"] = alumni.get("gender").map(norm_whitespace)
    alumni["country_of_origin"] = alumni.get("country_of_origin").map(standardize_country)
    alumni["institution_home"] = alumni.get("institution_home").map(norm_whitespace)
    alumni["phone"] = alumni.get("phone").map(norm_whitespace)
    alumni["cohort_raw"] = alumni.get("cohort_year").map(norm_whitespace)
    alumni["cohort_year"] = alumni["cohort_raw"].map(extract_cohort_year).astype("Int64")
    alumni["cohort_semester"] = alumni["cohort_raw"].map(extract_cohort_semester)
    alumni["discipline_degree_incoming"] = alumni.get("discipline_degree_incoming").map(norm_whitespace)
    alumni["host_name_raw"] = alumni.get("host_name_raw").map(norm_whitespace)
    alumni["host_comments_raw"] = alumni.get("host_comments_raw").map(norm_whitespace)

    # --- Scholars: create stable-ish IDs for now ---
    # Priority: email_primary; fallback: cleaned full name + cohort
    alumni["clean_full_name"] = alumni["full_name_raw"].map(clean_name)
    alumni["scholar_key"] = alumni["email_primary"].fillna(
        alumni["clean_full_name"].fillna("") + "|" + alumni["cohort_year"].astype("Int64").astype(str).fillna("")
    )

    scholars = (
        alumni.sort_values(["email_primary", "clean_full_name"])
        .drop_duplicates(subset=["scholar_key"], keep="first")
        .copy()
    )

    scholars["scholar_id"] = [str(uuid.uuid4()) for _ in range(len(scholars))]

    scholars_out = scholars[
        [
            "scholar_id",
            "first_name",
            "last_name",
            "full_name_raw",
            "gender",
            "country_of_origin",
            "institution_home",
            "email_primary",
            "phone",
        ]
    ].copy()

    # Join scholar_id back to alumni for participation rows
    key_to_id = dict(zip(scholars["scholar_key"], scholars["scholar_id"]))
    alumni["scholar_id"] = alumni["scholar_key"].map(key_to_id)

    participations_out = alumni[
    [
        "scholar_id",
        "cohort_year",
        "cohort_semester",
        "discipline_degree_incoming",
        "host_name_raw",
        "host_comments_raw",
    ]
    ].copy()

    participations_out["participation_id"] = [str(uuid.uuid4()) for _ in range(len(participations_out))]

    # --- Qualtrics ---
    q = pd.read_excel(QUALTRICS_XLSX)
    q.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in q.columns]
    # Drop the first row which is question text
    q = q.iloc[1:].copy()

    # Clean system fields (these names may exist; if not, adjust once you confirm headers)
    # Keep safe with .get
    response_id_col = "ResponseId" if "ResponseId" in q.columns else None
    recorded_col = "RecordedDate" if "RecordedDate" in q.columns else None

    if response_id_col is None:
        # fallback: first column that looks like ResponseId
        response_id_col = next((c for c in q.columns if "response" in c.lower() and "id" in c.lower()), q.columns[0])

    if recorded_col is None:
        recorded_col = next((c for c in q.columns if "recorded" in c.lower() and "date" in c.lower()), None)

    q["response_id"] = q[response_id_col].map(norm_whitespace)
    q["recorded_date"] = pd.to_datetime(q[recorded_col], errors="coerce") if recorded_col else pd.NaT

    # Attempt matching survey rows to scholars by recipient email if present
    rec_email_col = next((c for c in q.columns if c.lower() == "recipientemail"), None)
    if rec_email_col:
        q["respondent_email"] = q[rec_email_col].map(clean_email)
    else:
        q["respondent_email"] = None

    # Link scholar_id by email_primary (simple first pass)
    email_to_scholar = {e: sid for e, sid in zip(scholars_out["email_primary"], scholars_out["scholar_id"]) if e}
    q["scholar_id"] = q["respondent_email"].map(email_to_scholar)

    # Keep the entire cleaned survey table; you can later map specific Q columns to semantic fields
    survey_out = q.copy()

    # --- Write to DuckDB ---
    con = duckdb.connect(DB_PATH)
    con.execute("DROP TABLE IF EXISTS scholars")
    con.execute("DROP TABLE IF EXISTS participations")
    con.execute("DROP TABLE IF EXISTS survey_responses")

    con.register("scholars_df", scholars_out)
    con.register("participations_df", participations_out)
    con.register("survey_df", survey_out)

    con.execute("CREATE TABLE scholars AS SELECT * FROM scholars_df")
    con.execute("CREATE TABLE participations AS SELECT * FROM participations_df")
    con.execute("CREATE TABLE survey_responses AS SELECT * FROM survey_df")

    con.close()
    print(f"Built database: {DB_PATH}")
    print(f"scholars: {len(scholars_out):,}, participations: {len(participations_out):,}, survey_responses: {len(survey_out):,}")


if __name__ == "__main__":
    main()