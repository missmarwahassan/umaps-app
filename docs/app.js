const state = {
  data: null,
  filters: {
    query: "",
    country: "",
    year: "",
  },
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value ?? 0);
const cohortSortOrder = { Annual: 0, Winter: 1, Fall: 2 };

function setElementText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setElementHtml(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.innerHTML = value;
  }
}

function getCurrentCohortMeta(records) {
  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();
  const term = month >= 7 ? "Fall" : "Winter";
  const matchingTermRecords = records.filter(
    (record) => record.cohortYear === year && record.semester === term
  );
  const fallbackRecords = records.filter((record) => record.cohortYear === year);
  const activeRecords = matchingTermRecords.length ? matchingTermRecords : fallbackRecords;
  const scholarCount = new Set(activeRecords.map((record) => record.scholar_id)).size;

  return {
    year,
    term,
    label: `${term} ${year}`,
    scholarCount,
  };
}

function getIncomingCohortMeta(records, currentCohort) {
  const cohorts = records
    .filter((record) => record.cohortYear && record.semester)
    .map((record) => ({
      year: record.cohortYear,
      term: record.semester,
      scholarId: record.scholar_id,
    }));

  const uniqueCohorts = Array.from(
    new Map(
      cohorts.map((cohort) => [`${cohort.term}-${cohort.year}`, { year: cohort.year, term: cohort.term }])
    ).values()
  ).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return (cohortSortOrder[a.term] ?? 9) - (cohortSortOrder[b.term] ?? 9);
  });

  const currentIndex = uniqueCohorts.findIndex(
    (cohort) => cohort.year === currentCohort.year && cohort.term === currentCohort.term
  );
  const incoming = currentIndex >= 0 ? uniqueCohorts[currentIndex + 1] : null;
  if (!incoming) {
    return {
      label: "No later cohort in data",
      scholarCount: 0,
    };
  }

  const scholarCount = new Set(
    cohorts
      .filter((cohort) => cohort.year === incoming.year && cohort.term === incoming.term)
      .map((cohort) => cohort.scholarId)
  ).size;

  return {
    label: `${incoming.term} ${incoming.year}`,
    scholarCount,
  };
}

async function loadDashboard() {
  const response = await fetch("./data/dashboard.json");
  if (!response.ok) {
    throw new Error("Could not load dashboard data.");
  }

  state.data = await response.json();
  renderChrome();
  populateFilters();
  renderAll();
  wireEvents();
}

function renderChrome() {
  const { metrics, records } = state.data;
  const currentCohort = getCurrentCohortMeta(records);
  const incomingCohort = getIncomingCohortMeta(records, currentCohort);

  setElementText("year-range", `${metrics.yearRange.start}-${metrics.yearRange.end}`);
  setElementHtml("current-cohort", `Current Cohort:<br>${currentCohort.label}`);
  setElementText("current-cohort-detail", `${formatNumber(currentCohort.scholarCount)} scholars`);
  setElementText("current-cohort-label", currentCohort.label);
  setElementText("current-cohort-count", `${formatNumber(currentCohort.scholarCount)} scholars`);
  const incomingText = `${incomingCohort.label} · ${formatNumber(incomingCohort.scholarCount)} scholars`;
  setElementText("latest-cohort-text", incomingText);
  setElementText("latest-cohort", incomingText);

  const metricCards = [
    ["Unique scholars", formatNumber(metrics.uniqueScholars)],
    ["Participation records", formatNumber(metrics.participations)],
    ["Countries represented", formatNumber(metrics.countries)],
    ["Home institutions", formatNumber(metrics.institutions)],
    ["Host mentors", formatNumber(metrics.hosts)],
  ];

  document.getElementById("metrics-grid").innerHTML = metricCards
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span class="metric-label">${label}</span>
          <span class="metric-value">${value}</span>
        </article>
      `
    )
    .join("");
}

function populateFilters() {
  const countryFilter = document.getElementById("country-filter");
  const yearFilter = document.getElementById("year-filter");

  const countries = [...new Set(state.data.records.map((record) => record.country).filter(Boolean))].sort();
  const years = [...new Set(state.data.records.map((record) => record.cohortYear).filter(Boolean))].sort((a, b) => b - a);

  countryFilter.innerHTML += countries.map((country) => `<option value="${country}">${country}</option>`).join("");
  yearFilter.innerHTML += years.map((year) => `<option value="${year}">${year}</option>`).join("");
}

function wireEvents() {
  document.getElementById("search-input").addEventListener("input", (event) => {
    state.filters.query = event.target.value.trim().toLowerCase();
    renderDirectory();
  });

  document.getElementById("country-filter").addEventListener("change", (event) => {
    state.filters.country = event.target.value;
    renderDirectory();
  });

  document.getElementById("year-filter").addEventListener("change", (event) => {
    state.filters.year = event.target.value;
    renderDirectory();
  });
}

function renderAll() {
  renderLineChart();
  renderBarList("top-countries", state.data.series.topCountries.slice(0, 4), "scholars", "country_of_origin");
  renderBarList("top-institutions", state.data.series.topInstitutions, "scholars", "institution_home");
  renderBarList("top-hosts", state.data.series.topHosts, "participations", "host_name_raw");
  renderDirectory();
}

function renderBarList(targetId, items, valueKey, labelKey) {
  const max = Math.max(...items.map((item) => item[valueKey]), 1);
  document.getElementById(targetId).innerHTML = items
    .map((item) => {
      const institutionNote =
        targetId === "top-institutions" && item.firstYear
          ? `<span class="bar-context">Partnership established in: ${item.firstYear}</span>`
          : "";
      const tooltip =
        targetId === "top-hosts" && item.hostYears?.length
          ? ` title="Hosted in: ${item.hostYears
              .map((entry) => (entry.count > 1 ? `${entry.year} (${entry.count})` : `${entry.year}`))
              .join(", ")}"`
          : "";

      return `
        <div class="bar-row"${tooltip}>
          <div class="bar-meta">
            <div class="bar-copy">
              <span class="bar-label">${item[labelKey]}</span>
              ${institutionNote}
            </div>
            <span class="bar-value">${formatNumber(item[valueKey])}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(item[valueKey] / max) * 100}%"></div>
          </div>
        </div>
      `
    })
    .join("");
}

function renderLineChart() {
  const svg = document.getElementById("cohort-chart");
  const data = state.data.series.cohorts;
  const width = 760;
  const height = 340;
  const margin = { top: 20, right: 24, bottom: 46, left: 42 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const years = data.map((item) => item.cohort_year);
  const maxScholars = Math.max(...data.map((item) => item.scholars), 1);

  const x = (year) => {
    if (years.length === 1) return margin.left + plotWidth / 2;
    const index = years.indexOf(year);
    return margin.left + (index / (years.length - 1)) * plotWidth;
  };

  const y = (value) => margin.top + plotHeight - (value / maxScholars) * plotHeight;
  const linePath = data
    .map((item, index) => `${index === 0 ? "M" : "L"} ${x(item.cohort_year).toFixed(2)} ${y(item.scholars).toFixed(2)}`)
    .join(" ");
  const tickMarks = Array.from({ length: 5 }, (_, index) => Math.round((maxScholars / 4) * index));

  svg.innerHTML = `
    ${tickMarks
      .map((tick) => {
        const yPos = y(tick);
        return `
          <line x1="${margin.left}" y1="${yPos}" x2="${width - margin.right}" y2="${yPos}" stroke="rgba(0,39,76,0.12)" />
          <text x="${margin.left - 10}" y="${yPos + 4}" text-anchor="end" font-size="11" fill="rgba(79,96,116,1)">${tick}</text>
        `;
      })
      .join("")}
    <path d="${linePath}" fill="none" stroke="#00274c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
    ${data
      .map((item) => {
        const cx = x(item.cohort_year);
        const cy = y(item.scholars);
        return `
          <circle cx="${cx}" cy="${cy}" r="5" fill="#ffcb05" stroke="#00274c" stroke-width="3"></circle>
          <text x="${cx}" y="${height - 16}" text-anchor="middle" font-size="11" fill="rgba(79,96,116,1)">${item.cohort_year}</text>
        `;
      })
      .join("")}
  `;
}

function getFilteredRecords() {
  const { query, country, year } = state.filters;
  return state.data.records.filter((record) => {
    const matchesCountry = !country || record.country === country;
    const matchesYear = !year || String(record.cohortYear) === year;
    const haystack = [
      record.name,
      record.country,
      record.institution,
      record.discipline,
      record.host,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesCountry && matchesYear && matchesQuery;
  });
}

function renderDirectory() {
  const rows = getFilteredRecords();
  document.getElementById("results-count").textContent = `${formatNumber(rows.length)} matching records`;

  const body = document.getElementById("directory-body");
  if (!rows.length) {
    body.innerHTML = `<tr><td class="empty-state" colspan="6">No records match the current filters.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .slice(0, 150)
    .map(
      (record) => `
        <tr>
          <td>
            <div class="name-cell">
              <strong>${record.name ?? "Unknown scholar"}</strong>
            </div>
          </td>
          <td>${record.cohortYear ?? "—"}</td>
          <td>${record.country ?? "—"}</td>
          <td>${record.institution ?? "—"}</td>
          <td>${record.discipline ?? "—"}</td>
          <td>${record.host ?? "—"}</td>
        </tr>
      `
    )
    .join("");
}

loadDashboard().catch((error) => {
  document.body.innerHTML = `<main class="site-shell"><section class="panel-card"><h1>Dashboard unavailable</h1><p>${error.message}</p></section></main>`;
});
