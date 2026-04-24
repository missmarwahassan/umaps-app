# Publication Submission Setup

This workflow is designed so alumni can submit publication additions or corrections without anything going live automatically.

## Overview

1. Alumni submit through `docs/publication-submit.html`
2. The form sends the submission to your private Google Sheet
3. You review the submission manually
4. Only approved items are added to the source workbook and exported back onto the site

## Create the private spreadsheet

Create a Google Sheet in your own Google Drive with a tab named:

`Publication Intake`

Use this header row:

```text
received_at,review_status,submitted_at,submission_source,submitter_name,submitter_email,scholar_name,cohort_year,country,institution,publication_title,publication_type,stage,publication_year,container_title,publisher,volume_issue_pages,coauthors,item_link,full_citation,review_notes,confirm_review
```

Keep this spreadsheet private so only you can access it.

## Deploy the Google Apps Script

1. Open Google Apps Script
2. Create a new project
3. Paste in the code from `google_apps_script/publication_submission_webapp.gs`
4. Replace `PASTE_YOUR_PRIVATE_SPREADSHEET_ID_HERE` with your spreadsheet ID
5. Deploy it as a web app
6. Set access so anyone with the link can submit

This does not expose the spreadsheet itself. It only allows form submissions into it.

## Connect the site form

Open:

`docs/data/publication-submission-config.js`

and replace:

```js
endpoint: "",
```

with your deployed Apps Script URL:

```js
endpoint: "https://script.google.com/macros/s/PASTE_DEPLOYED_WEB_APP_ID/exec",
```

## Review workflow

- New submissions land in the spreadsheet with `Pending review`
- Review the citation, link, and scholar details
- Only after review should you add the record to the main publication source data
- Re-export the site data when you want approved submissions reflected publicly
