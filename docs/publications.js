const publicationState = {
  data: null,
  scholarById: new Map(),
  filters: {
    query: "",
    publicationType: "",
    stage: "",
    cohort: "",
    country: "",
  },
  selected: null,
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value ?? 0);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function truncate(value, limit = 160) {
  const text = String(value ?? "");
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function normalizedYear(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function appendOptions(select, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    select.append(option);
  });
}

function toHaystack(publication) {
  return [
    publication.title,
    publication.citation,
    publication.publicationType,
    publication.stage,
    ...(publication.scholarNames ?? []),
    ...(publication.countries ?? []),
    ...(publication.institutions ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function loadPublications() {
  const response = await fetch("./data/publications.json");
  if (!response.ok) {
    throw new Error("Could not load publication data.");
  }

  const data = await response.json();
  const publications = Array.isArray(data.publications) ? data.publications : [];
  const scholars = Array.isArray(data.scholars) ? data.scholars : [];

  publicationState.data = {
    ...data,
    publications,
    scholars,
  };
  publicationState.scholarById = new Map(
    scholars.filter((scholar) => scholar?.scholarUid).map((scholar) => [scholar.scholarUid, scholar])
  );

  renderHeroMetrics();
  populateFilters();
  wireEvents();
  renderAll();
}

function renderHeroMetrics() {
  const metrics = publicationState.data?.metrics ?? {};
  const publications = publicationState.data?.publications ?? [];
  const scholars = publicationState.data?.scholars ?? [];

  document.getElementById("publications-total-records").textContent = formatNumber(
    metrics.parsedPublications ?? publications.length
  );
  document.getElementById("publications-total-scholars").textContent = formatNumber(
    metrics.scholarsWithPublications ?? scholars.length
  );
}

function populateFilters() {
  const publications = publicationState.data?.publications ?? [];
  const scholars = publicationState.data?.scholars ?? [];

  const types = [...new Set(publications.map((item) => item.publicationType).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const stages = [...new Set(publications.map((item) => item.stage).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const cohorts = [...new Set(scholars.map((item) => item.cohortYear).filter(Boolean))].sort((a, b) => b - a);
  const countries = [...new Set(scholars.map((item) => item.country).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

  appendOptions(document.getElementById("publication-type"), types);
  appendOptions(document.getElementById("publication-stage"), stages);
  appendOptions(document.getElementById("publication-cohort"), cohorts);
  appendOptions(document.getElementById("publication-country"), countries);
}

function wireEvents() {
  document.getElementById("publication-search").addEventListener("input", (event) => {
    publicationState.filters.query = event.target.value.trim().toLowerCase();
    renderAll();
  });

  document.getElementById("publication-type").addEventListener("change", (event) => {
    publicationState.filters.publicationType = event.target.value;
    renderAll();
  });

  document.getElementById("publication-stage").addEventListener("change", (event) => {
    publicationState.filters.stage = event.target.value;
    renderAll();
  });

  document.getElementById("publication-cohort").addEventListener("change", (event) => {
    publicationState.filters.cohort = event.target.value;
    renderAll();
  });

  document.getElementById("publication-country").addEventListener("change", (event) => {
    publicationState.filters.country = event.target.value;
    renderAll();
  });
}

function getFilteredPublications() {
  const publications = publicationState.data?.publications ?? [];
  const { query, publicationType, stage, cohort, country } = publicationState.filters;

  return publications.filter((publication) => {
    const matchesQuery = !query || toHaystack(publication).includes(query);
    const matchesType = !publicationType || publication.publicationType === publicationType;
    const matchesStage = !stage || publication.stage === stage;
    const matchesCohort = !cohort || (publication.cohorts ?? []).includes(Number(cohort));
    const matchesCountry = !country || (publication.countries ?? []).includes(country);
    return matchesQuery && matchesType && matchesStage && matchesCohort && matchesCountry;
  });
}

function ensureSelection(publications) {
  if (!publications.length) {
    publicationState.selected = null;
    return;
  }

  if (!publicationState.selected) {
    publicationState.selected = { kind: "publication", id: publications[0].publicationId };
    return;
  }

  if (publicationState.selected.kind === "publication") {
    const stillVisible = publications.some((item) => item.publicationId === publicationState.selected.id);
    if (!stillVisible) {
      publicationState.selected = { kind: "publication", id: publications[0].publicationId };
    }
    return;
  }

  if (publicationState.selected.kind === "scholar") {
    const stillVisible = publications.some((item) => (item.scholarUids ?? []).includes(publicationState.selected.id));
    if (!stillVisible) {
      publicationState.selected = { kind: "publication", id: publications[0].publicationId };
    }
  }
}

function renderAll() {
  const publications = getFilteredPublications();
  ensureSelection(publications);

  renderNote(publications);
  renderSummary(publications);
  renderTypeBars(publications);
  renderStageBars(publications);
  renderYearBars(publications);
  renderScholarBars(publications);
  renderDetail(publications);
  renderDirectory(publications);
}

function renderNote(publications) {
  const note = document.getElementById("publications-note");
  const total = publicationState.data?.publications?.length ?? 0;
  const visibleScholars = new Set(publications.flatMap((item) => item.scholarUids ?? [])).size;
  const baseNote = publicationState.data?.note ?? "";
  note.textContent = `${baseNote} Showing ${formatNumber(publications.length)} of ${formatNumber(
    total
  )} parsed publication records across ${formatNumber(visibleScholars)} alumni in the current view.`;
}

function renderSummary(publications) {
  const scholarIds = new Set(publications.flatMap((item) => item.scholarUids ?? []));
  const postCount = publications.filter((item) => item.stage === "Post-UMAPS").length;
  const countryCount = new Set(publications.flatMap((item) => item.countries ?? [])).size;
  const yearValues = publications.map((item) => normalizedYear(item.year)).filter((value) => value !== null);
  const latestYear = yearValues.length ? Math.max(...yearValues) : null;

  document.getElementById("publication-summary").innerHTML = `
    <div class="summary-chip">
      <strong>${formatNumber(publications.length)}</strong>
      <span>Publication records in the current filtered view</span>
    </div>
    <div class="summary-chip">
      <strong>${formatNumber(scholarIds.size)}</strong>
      <span>UMAPS alumni represented in the current filtered view</span>
    </div>
    <div class="summary-chip">
      <strong>${formatNumber(postCount)}</strong>
      <span>Publications tagged as post-UMAPS</span>
    </div>
    <div class="summary-chip">
      <strong>${latestYear ?? "N/A"}</strong>
      <span>Most recent publication year currently visible</span>
    </div>
    <div class="summary-chip">
      <strong>${formatNumber(countryCount)}</strong>
      <span>Countries represented in visible publication records</span>
    </div>
  `;
}

function renderBars(containerId, entries, emptyMessage, options = {}) {
  const { activeValue = "", activeKey = "", buttonKey = "", contextKey = "" } = options;
  const container = document.getElementById(containerId);

  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }

  const max = Math.max(...entries.map((entry) => entry.count), 1);
  container.innerHTML = entries
    .map((entry) => {
      const label = escapeHtml(entry.label);
      const context = contextKey && entry[contextKey] ? `<span class="bar-context">${escapeHtml(entry[contextKey])}</span>` : "";
      const activeClass = activeKey && activeValue === entry[activeKey] ? " is-active" : "";
      const attribute = buttonKey ? ` data-${buttonKey}="${escapeHtml(entry[activeKey])}"` : "";
      const tag = buttonKey ? "button" : "div";

      return `
        <${tag} class="bar-row${buttonKey ? ` bar-button${activeClass}` : ""}"${attribute}${buttonKey ? ' type="button"' : ""}>
          <div class="bar-meta">
            <div class="bar-copy">
              <span class="bar-label">${label}</span>
              ${context}
            </div>
            <span class="bar-value">${formatNumber(entry.count)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(entry.count / max) * 100}%"></div>
          </div>
        </${tag}>
      `;
    })
    .join("");
}

function renderTypeBars(publications) {
  const counts = new Map();
  publications.forEach((publication) => {
    const key = publication.publicationType || "Status Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const entries = [...counts.entries()]
    .map(([label, count]) => ({ label, count, value: label }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  renderBars("publication-type-bars", entries, "No publication types match the current filters.", {
    activeValue: publicationState.filters.publicationType,
    activeKey: "value",
    buttonKey: "type",
  });

  document.querySelectorAll("#publication-type-bars [data-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.type;
      publicationState.filters.publicationType = publicationState.filters.publicationType === next ? "" : next;
      document.getElementById("publication-type").value = publicationState.filters.publicationType;
      renderAll();
    });
  });
}

function renderStageBars(publications) {
  const counts = new Map();
  publications.forEach((publication) => {
    const key = publication.stage || "Needs review";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const entries = [...counts.entries()]
    .map(([label, count]) => ({ label, count, value: label }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  renderBars("publication-stage-bars", entries, "No publication stages match the current filters.", {
    activeValue: publicationState.filters.stage,
    activeKey: "value",
    buttonKey: "stage",
  });

  document.querySelectorAll("#publication-stage-bars [data-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.stage;
      publicationState.filters.stage = publicationState.filters.stage === next ? "" : next;
      document.getElementById("publication-stage").value = publicationState.filters.stage;
      renderAll();
    });
  });
}

function renderYearBars(publications) {
  const counts = new Map();
  publications.forEach((publication) => {
    const year = normalizedYear(publication.year);
    if (year !== null) {
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
  });

  const entries = [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 10)
    .map(([year, count]) => ({ label: String(year), count }));

  renderBars("publication-year-bars", entries, "No publication years are available in the current view.");
}

function renderScholarBars(publications) {
  const counts = new Map();
  publications.forEach((publication) => {
    (publication.scholarUids ?? []).forEach((uid) => {
      counts.set(uid, (counts.get(uid) ?? 0) + 1);
    });
  });

  const entries = [...counts.entries()]
    .map(([uid, count]) => {
      const scholar = publicationState.scholarById.get(uid);
      return scholar
        ? {
            label: scholar.name,
            count,
            value: uid,
            context: [scholar.country, scholar.institution].filter(Boolean).join(" | "),
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 10);

  renderBars("publication-scholar-bars", entries, "No alumni publication records match the current filters.", {
    activeValue: publicationState.selected?.kind === "scholar" ? publicationState.selected.id : "",
    activeKey: "value",
    buttonKey: "scholar",
    contextKey: "context",
  });

  document.querySelectorAll("#publication-scholar-bars [data-scholar]").forEach((button) => {
    button.addEventListener("click", () => {
      publicationState.selected = { kind: "scholar", id: button.dataset.scholar };
      renderDetail(publications);
      renderScholarBars(publications);
      renderDirectory(publications);
    });
  });
}

function renderScholarDetail(scholar, publications) {
  const scholarPublications = publications
    .filter((item) => (item.scholarUids ?? []).includes(scholar.scholarUid))
    .sort((a, b) => (normalizedYear(b.year) ?? 0) - (normalizedYear(a.year) ?? 0));

  const recentList = scholarPublications
    .slice(0, 6)
    .map((item) => {
      const year = normalizedYear(item.year);
      return `<li><strong>${escapeHtml(item.title || "Untitled publication")}</strong><span>${
        year ?? "Year unavailable"
      } | ${escapeHtml(item.publicationType || "Status Unknown")}</span></li>`;
    })
    .join("");

  return `
    <div class="project-detail-header">
      <div>
        <p class="eyebrow">Scholar profile</p>
        <h3>${escapeHtml(scholar.name)}</h3>
      </div>
      <span class="type-badge">${formatNumber(scholarPublications.length)} records in current view</span>
    </div>
    <div class="project-detail-grid">
      <div><strong>Country</strong><span>${escapeHtml(scholar.country || "Not listed")}</span></div>
      <div><strong>Institution</strong><span>${escapeHtml(scholar.institution || "Not listed")}</span></div>
      <div><strong>Cohort</strong><span>${escapeHtml(
        [scholar.semester, scholar.cohortYear].filter(Boolean).join(" ") || String(scholar.cohortYear || "Not listed")
      )}</span></div>
      <div><strong>Reported publications</strong><span>${formatNumber(scholar.publicationCount || scholarPublications.length)}</span></div>
      <div><strong>Post-UMAPS output</strong><span>${formatNumber(scholar.postUmapsCount || 0)}</span></div>
    </div>
    <div class="project-detail-body">
      <strong>Recent records in current view</strong>
      <ul class="detail-list">${recentList || "<li>No publication titles are visible under the current filters.</li>"}</ul>
    </div>
  `;
}

function renderPublicationDetail(publication) {
  const year = normalizedYear(publication.year);
  const scholars = (publication.scholarNames ?? []).join(", ") || "Not listed";
  const countries = (publication.countries ?? []).join(", ") || "Not listed";
  const institutions = (publication.institutions ?? []).join(", ") || "Not listed";

  return `
    <div class="project-detail-header">
      <div>
        <p class="eyebrow">Publication record</p>
        <h3>${escapeHtml(publication.title || "Untitled publication")}</h3>
      </div>
      <span class="type-badge">${escapeHtml(publication.publicationType || "Status Unknown")}</span>
    </div>
    <div class="project-detail-grid">
      <div><strong>Year</strong><span>${year ?? "Not listed"}</span></div>
      <div><strong>Stage</strong><span>${escapeHtml(publication.stage || "Needs review")}</span></div>
      <div><strong>Scholar(s)</strong><span>${escapeHtml(scholars)}</span></div>
      <div><strong>Country</strong><span>${escapeHtml(countries)}</span></div>
      <div><strong>Institution</strong><span>${escapeHtml(institutions)}</span></div>
      <div><strong>Source</strong><span>${escapeHtml(publication.source || "Workbook entry")}</span></div>
    </div>
    <div class="project-detail-body">
      <strong>Citation</strong>
      <p>${escapeHtml(publication.citation || publication.title || "No citation text is currently available.")}</p>
    </div>
  `;
}

function renderDetail(publications) {
  const container = document.getElementById("publication-detail");

  if (!publications.length || !publicationState.selected) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  if (publicationState.selected.kind === "scholar") {
    const scholar = publicationState.scholarById.get(publicationState.selected.id);
    if (!scholar) {
      publicationState.selected = publications[0] ? { kind: "publication", id: publications[0].publicationId } : null;
      renderDetail(publications);
      return;
    }
    container.hidden = false;
    container.innerHTML = renderScholarDetail(scholar, publications);
    return;
  }

  const publication = publications.find((item) => item.publicationId === publicationState.selected.id);
  if (!publication) {
    publicationState.selected = publications[0] ? { kind: "publication", id: publications[0].publicationId } : null;
    renderDetail(publications);
    return;
  }

  container.hidden = false;
  container.innerHTML = renderPublicationDetail(publication);
}

function renderDirectory(publications) {
  const body = document.getElementById("publication-directory-body");
  const results = document.getElementById("publication-results-count");

  results.textContent = `${formatNumber(publications.length)} publication records in the current view`;

  if (!publications.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No publication records match the current filters.</td>
      </tr>
    `;
    return;
  }

  const sorted = [...publications].sort((a, b) => {
    const yearDiff = (normalizedYear(b.year) ?? 0) - (normalizedYear(a.year) ?? 0);
    if (yearDiff !== 0) return yearDiff;
    return String(a.title || a.citation || "").localeCompare(String(b.title || b.citation || ""));
  });

  body.innerHTML = sorted
    .map((publication) => {
      const isSelected =
        publicationState.selected?.kind === "publication" && publicationState.selected.id === publication.publicationId;

      return `
        <tr data-publication-id="${escapeHtml(publication.publicationId)}"${isSelected ? ' class="is-selected"' : ""}>
          <td>
            <div class="name-cell">
              <strong>${escapeHtml(publication.title || "Untitled publication")}</strong>
              <span>${escapeHtml(truncate(publication.citation || "No citation text currently available.", 120))}</span>
            </div>
          </td>
          <td>${escapeHtml((publication.scholarNames ?? []).join(", ") || "Not listed")}</td>
          <td>${escapeHtml(publication.publicationType || "Status Unknown")}</td>
          <td>${escapeHtml(publication.stage || "Needs review")}</td>
          <td>${normalizedYear(publication.year) ?? "N/A"}</td>
          <td>${escapeHtml((publication.countries ?? []).join(", ") || "Not listed")}</td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("[data-publication-id]").forEach((row) => {
    row.addEventListener("click", () => {
      publicationState.selected = { kind: "publication", id: row.dataset.publicationId };
      renderDetail(publications);
      renderScholarBars(publications);
      renderDirectory(publications);
    });
  });
}

loadPublications().catch((error) => {
  console.error(error);
  document.getElementById("publications-note").textContent = error.message || "Publication data could not be loaded.";
  document.getElementById("publication-summary").innerHTML = `
    <div class="empty-state">Publications are temporarily unavailable.</div>
  `;
  document.getElementById("publication-type-bars").innerHTML = `
    <div class="empty-state">Publication data could not be displayed.</div>
  `;
  document.getElementById("publication-stage-bars").innerHTML = `
    <div class="empty-state">Publication data could not be displayed.</div>
  `;
  document.getElementById("publication-year-bars").innerHTML = `
    <div class="empty-state">Publication data could not be displayed.</div>
  `;
  document.getElementById("publication-scholar-bars").innerHTML = `
    <div class="empty-state">Publication data could not be displayed.</div>
  `;
  document.getElementById("publication-directory-body").innerHTML = `
    <tr><td colspan="6" class="empty-state">Publication data could not be displayed.</td></tr>
  `;
  document.getElementById("publication-results-count").textContent = "Publications unavailable";
});
