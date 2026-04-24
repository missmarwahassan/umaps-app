const engagementSubmissionConfig = window.UMAPS_ENGAGEMENT_SUBMISSION ?? {};
let engagementSubmissionData = { records: [] };

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function appendOptions(targetId, values) {
  const datalist = document.getElementById(targetId);
  if (!datalist) return;
  datalist.innerHTML = values
    .map((value) => `<option value="${String(value).replaceAll('"', "&quot;")}"></option>`)
    .join("");
}

function populateEngagementSubmissionLists() {
  const records = Array.isArray(engagementSubmissionData.records) ? engagementSubmissionData.records : [];

  appendOptions("engagement-project-number-options", uniqueSorted(records.map((item) => item.projectNo)));
  appendOptions("engagement-project-title-options", uniqueSorted(records.map((item) => item.projectTitle)));
  appendOptions("engagement-pi-options", uniqueSorted(records.map((item) => item.piName)));
  appendOptions("engagement-career-options", uniqueSorted(records.map((item) => item.career)));
  appendOptions("engagement-college-options", uniqueSorted(records.map((item) => item.college)));
  appendOptions("engagement-country-options", uniqueSorted(records.map((item) => item.country)));
}

async function loadEngagementSubmissionData() {
  const response = await fetch("./data/engagement.json");
  if (!response.ok) {
    throw new Error("Could not load engagement submission data.");
  }

  engagementSubmissionData = await response.json();
}

function updateEngagementSubmissionConfigState() {
  const note = document.getElementById("engagement-submission-config-note");
  const button = document.getElementById("engagement-submit-button");
  const hasEndpoint = Boolean(engagementSubmissionConfig.endpoint && !String(engagementSubmissionConfig.endpoint).includes("PASTE"));

  if (hasEndpoint) {
    note.textContent = "This form is connected to your private review spreadsheet.";
    button.disabled = false;
    return;
  }

  note.innerHTML = `This page is ready, but it still needs your private spreadsheet endpoint. Use the setup guide in <a href="../ENGAGEMENT_SUBMISSION_SETUP.md" target="_blank" rel="noreferrer">ENGAGEMENT_SUBMISSION_SETUP.md</a> and then paste your deployed Google Apps Script URL into <code>docs/data/engagement-submission-config.js</code>.`;
  button.disabled = true;
}

async function handleEngagementSubmission(event) {
  event.preventDefault();

  const status = document.getElementById("engagement-submission-status");
  const form = event.currentTarget;
  const formData = new FormData(form);

  formData.append("submitted_at", new Date().toISOString());
  formData.append("submission_source", "UMAPS engagement submission page");
  formData.append("review_status", "Pending review");

  status.textContent = "Submitting for review...";

  try {
    await fetch(engagementSubmissionConfig.endpoint, {
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

async function initEngagementSubmissionPage() {
  try {
    await loadEngagementSubmissionData();
    populateEngagementSubmissionLists();
  } catch (error) {
    console.error(error);
  }

  updateEngagementSubmissionConfigState();
  document.getElementById("engagement-submission-form").addEventListener("submit", handleEngagementSubmission);
}

initEngagementSubmissionPage();
