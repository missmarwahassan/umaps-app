from pathlib import Path

import altair as alt
import duckdb
import pandas as pd
import streamlit as st

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "umaps.db"

st.set_page_config(page_title="UMAPS Explorer", layout="wide")


@st.cache_data
def load_tables():
    if not DB_PATH.exists():
        return None, None, f"Database file not found: {DB_PATH}"

    try:
        con = duckdb.connect(str(DB_PATH), read_only=True)
        scholars = con.execute("SELECT * FROM scholars").df()
        participations = con.execute("SELECT * FROM participations").df()
        con.close()
        return scholars, participations, None
    except Exception as e:
        return None, None, f"Error loading database: {e}"


scholars, participations, load_error = load_tables()

st.title("UMAPS Scholars Explorer")

if load_error:
    st.error(load_error)
    st.info("Make sure umaps.db exists in the same folder as app.py.")
    st.stop()

if scholars is None or participations is None:
    st.error("Could not load data.")
    st.stop()

if scholars.empty or participations.empty:
    st.warning("The database loaded, but one or more tables are empty.")
    st.write("Scholars rows:", 0 if scholars is None else len(scholars))
    st.write("Participations rows:", 0 if participations is None else len(participations))
    st.stop()

# Debug block while testing
with st.expander("Debug info"):
    st.write("App directory:", str(BASE_DIR))
    st.write("Database path:", str(DB_PATH))
    st.write("Database exists:", DB_PATH.exists())
    st.write("Scholars rows:", len(scholars))
    st.write("Participations rows:", len(participations))
    st.write("Scholars columns:", scholars.columns.tolist())
    st.write("Participations columns:", participations.columns.tolist())

# Join for main view
view = participations.merge(scholars, on="scholar_id", how="left")

if view.empty:
    st.warning("The join between participations and scholars returned no rows.")
    st.stop()

# Clean cohort_year for filtering
view["cohort_year"] = pd.to_numeric(view["cohort_year"], errors="coerce")

# --- Sidebar filters ---
with st.sidebar:
    st.header("Filters")

    q = st.text_input("Search (name or email)", "")

    valid_years = sorted(view["cohort_year"].dropna().astype(int).unique().tolist())
    if valid_years:
        year_min, year_max = min(valid_years), max(valid_years)
        year_range = st.slider("Cohort year range", year_min, year_max, (year_min, year_max))
    else:
        year_range = None
        st.info("No cohort years available.")

    countries = sorted([c for c in view["country_of_origin"].dropna().unique().tolist()])
    country_sel = st.multiselect("Country of origin", countries, [])

# Apply filters
filtered = view.copy()

if year_range is not None:
    filtered = filtered[
        (filtered["cohort_year"].fillna(0) >= year_range[0]) &
        (filtered["cohort_year"].fillna(9999) <= year_range[1])
    ]

if country_sel:
    filtered = filtered[filtered["country_of_origin"].isin(country_sel)]

if q.strip():
    qq = q.strip().lower()
    filtered = filtered[
        filtered["full_name_raw"].fillna("").str.lower().str.contains(qq, na=False)
        | filtered["email_primary"].fillna("").str.lower().str.contains(qq, na=False)
    ]

# --- Top metrics ---
c1, c2, c3 = st.columns(3)
c1.metric("Scholars (unique)", f"{filtered['scholar_id'].nunique():,}")
c2.metric("Participations", f"{len(filtered):,}")
c3.metric("Countries represented", f"{filtered['country_of_origin'].nunique():,}")

# --- Scholar table ---
st.subheader("Search Results")

table_cols = [
    "full_name_raw",
    "email_primary",
    "country_of_origin",
    "institution_home",
    "cohort_year",
    "discipline_degree_incoming",
    "host_name_raw",
]

available_cols = [c for c in table_cols if c in filtered.columns]

if filtered.empty:
    st.info("No records match the selected filters.")
else:
    show = filtered[available_cols].sort_values(
        by=[c for c in ["cohort_year", "full_name_raw"] if c in available_cols],
        ascending=[False, True][:len([c for c in ["cohort_year", "full_name_raw"] if c in available_cols])]
    )
    st.dataframe(show, use_container_width=True, height=320)

# --- Country counts over time ---
st.subheader("Country Counts by Cohort Year")

counts = (
    filtered.dropna(subset=["country_of_origin", "cohort_year"])
    .groupby(["cohort_year", "country_of_origin"], as_index=False)
    .agg(n=("scholar_id", "nunique"))
)

if counts.empty:
    st.info("No country/count data available for the selected filters.")
else:
    year_options = sorted(counts["cohort_year"].astype(int).unique().tolist())
    selected_year = st.select_slider(
        "Select a cohort year",
        options=year_options,
        value=year_options[-1]
    )

    year_df = counts[counts["cohort_year"].astype(int) == selected_year].copy()

    left, right = st.columns([1, 1])

    with left:
        st.markdown("**Top countries (selected year)**")
        st.dataframe(
            year_df.sort_values("n", ascending=False).head(15),
            use_container_width=True
        )

    with right:
        st.markdown("**Country counts**")
        chart = (
            alt.Chart(year_df)
            .mark_bar()
            .encode(
                y=alt.Y("country_of_origin:N", sort="-x", title="Country"),
                x=alt.X("n:Q", title="Unique Scholars"),
                tooltip=["country_of_origin:N", "n:Q"],
            )
            .properties(height=420)
        )
        st.altair_chart(chart, use_container_width=True)