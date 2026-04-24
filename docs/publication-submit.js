const submissionConfig = window.UMAPS_PUBLICATION_SUBMISSION ?? {};

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function appendDatalistOptions(targetId, values) {
  const datalist = document.getElementById(targetId);
  if (!datalist) return;
  datalist.innerHTML = values.map((value) => `<option value="${String(value).replaceAll('"', "&quot;")}"></option>`).join("");
}

function populateSubmissionLists() {
  const data = window.UMAPS_PUBLICATIONS_DATA ?? {};
  const scholars = Array.isArray(data.scholars) ? data.scholars : [];

  appendDatalistOptions(
    "scholar-name-options",
    uniqueSorted(scholars.map((item) => item.name))
  );
  appendDatalistOptions(
    "cohort-year-options",
    uniqueSorted(scholars.map((item) => item.cohortYear))
  );
  appendDatalistOptions(
    "country-options",
    uniqueSorted(scholars.map((item) => item.country))
  );
}

function updateSubmissionConfigState() {
  const note = document.getElementById("submission-config-note");
  const button = document.getElementById("publication-submit-button");
  const hasEndpoint = Boolean(submissionConfig.endpoint && !String(submissionConfig.endpoint).includes("PASTE"));

  if (hasEndpoint) {
    note.textContent = "This form is connected to your private review spreadsheet.";
    button.disabled = false;
    return;
  }

  note.innerHTML = `This page is ready, but it still needs your private spreadsheet endpoint. Use the setup guide in <a href="../PUBLICATION_SUBMISSION_SETUP.md" target="_blank" rel="noreferrer">PUBLICATION_SUBMISSION_SETUP.md</a> and then paste your deployed Google Apps Script URL into <code>docs/data/publication-submission-config.js</code>.`;
  button.disabled = true;
}

async function handleSubmission(event) {
  event.preventDefault();

  const status = document.getElementById("publication-submission-status");
  const form = event.currentTarget;
  const formData = new FormData(form);

  formData.append("submitted_at", new Date().toISOString());
  formData.append("submission_source", "UMAPS publications submission page");
  formData.append("review_status", "Pending review");

  status.textContent = "Submitting for review...";

  try {
    await fetch(submissionConfig.endpoint, {
      method: "POST",
      body: formData,
      mode: "no-cors",
    });

    form.reset();
    status.textContent = "Submission received. It has been sent to the private review spreadsheet and will not appear publicly until reviewed.";
  } catch (error) {
    console.error(error);
    status.textContent = "This submission could not be sent right now. Please try again or contact the site owner.";
  }
}

function initPublicationSubmissionPage() {
  populateSubmissionLists();
  updateSubmissionConfigState();
  document.getElementById("publication-submission-form").addEventListener("submit", handleSubmission);
}

initPublicationSubmissionPage();
