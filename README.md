# UMAPS Dashboard

A public-facing dashboard and data site for the University of Michigan African Studies Center's UMAPS program.

## Live site
https://missmarwahassan.github.io/umaps-app/
## What’s Inside

- `Dashboard` for alumni, cohorts, hosts, and program context
- `Insights` for Africa-over-time and survey summaries
- `Engagement` for U-M Africa project mapping and filtering
- `Publications` for alumni scholarship and output

## Local Preview

Serve the `docs/` folder locally:

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/docs/`
- `http://localhost:8000/docs/insights.html`
- `http://localhost:8000/docs/engagement.html`
- `http://localhost:8000/docs/publications.html`

If port `8000` is busy, use another port such as `8001`.

## Data Refresh

The dashboard is built from exported JSON files in `docs/data/`.

Useful scripts:

- `export_dashboard_data.py`
- `export_engagement_data.py`
- `export_publications_data.py`

If the source spreadsheets change, rerun the export scripts and refresh the browser.

## Publishing

This site is designed for GitHub Pages from the `main` branch and the `docs/` folder.

Typical update flow:

```bash
git add docs export_dashboard_data.py export_engagement_data.py export_publications_data.py
git commit -m "Update UMAPS site"
git push origin main
```

## Project Notes

- The public site is static HTML, CSS, and JavaScript.
- The alumni directory intentionally omits email addresses.
- Brand assets and site copy are centered on the African Studies Center.
