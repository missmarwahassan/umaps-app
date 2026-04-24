function doPost(e) {
  var spreadsheetId = "PASTE_YOUR_PRIVATE_SPREADSHEET_ID_HERE";
  var sheetName = "Publication Intake";
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
    params.scholar_name || "",
    params.cohort_year || "",
    params.country || "",
    params.institution || "",
    params.publication_title || "",
    params.publication_type || "",
    params.stage || "",
    params.publication_year || "",
    params.container_title || "",
    params.publisher || "",
    params.volume_issue_pages || "",
    params.coauthors || "",
    params.item_link || "",
    params.full_citation || "",
    params.review_notes || "",
    params.confirm_review || "",
  ]);

  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}
