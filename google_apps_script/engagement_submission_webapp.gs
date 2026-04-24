function doGet() {
  return ContentService
    .createTextOutput("UMAPS engagement submission endpoint is live.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var spreadsheetId = "PASTE_YOUR_PRIVATE_SPREADSHEET_ID_HERE";
  var sheetName = "Engagement Intake";
  var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);

  if (!sheet) {
    return ContentService.createTextOutput("Missing sheet").setMimeType(ContentService.MimeType.TEXT);
  }

  var params = e.parameter || {};

  sheet.appendRow([
    new Date(),
    params.review_status || "Pending review",
    params.submitted_at || "",
    params.submission_source || "",
    params.submitter_name || "",
    params.submitter_email || "",
    params.submission_kind || "",
    params.project_no || "",
    params.project_title || "",
    params.pi_name || "",
    params.career || "",
    params.project_type || "",
    params.college || "",
    params.country || "",
    params.city || "",
    params.collaborators || "",
    params.project_description || "",
    params.funding_source || "",
    params.funding_duration || "",
    params.item_link || "",
    params.review_notes || "",
    params.confirm_review || "",
  ]);

  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}
