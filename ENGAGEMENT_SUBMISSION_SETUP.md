# Engagement Submission Setup

Use this workflow to collect engagement project additions or corrections privately before anything is added to the public site.

## 1. Create the private Google Sheet

Create a Google Sheet and name the first tab exactly:

`Engagement Intake`

Use this header row:

```text
received_at,review_status,submitted_at,submission_source,submitter_name,submitter_email,submission_kind,project_no,project_title,pi_name,career,project_type,college,country,city,collaborators,project_description,funding_source,funding_duration,item_link,review_notes,confirm_review
```

Keep this sheet private.

## 2. Update the Apps Script

Open:

`google_apps_script/engagement_submission_webapp.gs`

Replace:

```javascript
var spreadsheetId = "PASTE_YOUR_PRIVATE_SPREADSHEET_ID_HERE";
```

with your actual Google Sheet ID.

## 3. Deploy the Apps Script as a web app

In Google Apps Script:

1. Click `Deploy`
2. Choose `New deployment`
3. Select `Web app`
4. Set:
   - `Execute as`: `Me`
   - `Who has access`: `Anyone`
5. Deploy and authorize the script

The deployed `/exec` URL is the private intake endpoint for the site form.

## 4. Add the endpoint to the site

Open:

`docs/data/engagement-submission-config.js`

Replace:

```javascript
window.UMAPS_ENGAGEMENT_SUBMISSION = {
  endpoint: "",
};
```

with:

```javascript
window.UMAPS_ENGAGEMENT_SUBMISSION = {
  endpoint: "YOUR_DEPLOYED_APPS_SCRIPT_URL",
};
```

## 5. Test locally

Run:

```bash
python3 -m http.server 8000
```

Then open:

`http://localhost:8000/docs/engagement-submit.html`

Submit a test record and confirm a new row appears in your private sheet.
