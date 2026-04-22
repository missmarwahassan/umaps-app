const state = {
  data: null,
  filters: {
    query: "",
    country: "",
    year: "",
  },
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value ?? 0);

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
  const { metrics } = state.data;
  const yearRange = metrics.yearRange.start && metrics.yearRange.end
    ? `${metrics.yearRange.start}-${metrics.yearRange.end}`
    : "Range unavailable";
  const latestCohort = metrics.latestCohort.year
    ? `${formatNumber(metrics.latestCohort.scholars)} scholars`
    : "No cohort data";

  document.getElementById("year-range").textContent = yearRange;
  document.getElementById("latest-cohort").textContent = latestCohort;

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
  renderBarList("top-countries", state.data.series.topCountries, "scholars", "country_of_origin");
  renderBarList("top-institutions", state.data.series.topInstitutions, "scholars", "institution_home");
  renderBarList("top-hosts", state.data.series.topHosts, "participations", "host_name_raw");
  renderLatestCohort();
  renderDirectory();
}

function renderBarList(targetId, items, valueKey, labelKey) {
  const max = Math.max(...items.map((item) => item[valueKey]), 1);
  document.getElementById(targetId).innerHTML = items
    .map(
      (item) => `
        <div class="bar-row">
          <div class="bar-meta">
            <span class="bar-label">${item[labelKey]}</span>
            <span class="bar-value">${formatNumber(item[valueKey])}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(item[valueKey] / max) * 100}%"></div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderLatestCohort() {
  const { latestCohort, latestCohortCountries } = state.data.series;
  const latestYear = state.data.metrics.latestCohort.year;
  const container = document.getElementById("latest-cohort-countries");

  if (!latestYear || !latestCohortCountries.length) {
    container.innerHTML = `<div class="empty-state">No latest cohort geography is available yet.</div>`;
    return;
  }

  container.innerHTML = latestCohortCountries
    .map(
      (item, index) => `
        <div class="rank-row">
          <span class="rank-name">${index + 1}. ${item.country_of_origin}</span>
          <span class="rank-value">${formatNumber(item.scholars)} scholars in ${latestYear}</span>
        </div>
      `
    )
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

  const areaPath = `${linePath} L ${x(years[years.length - 1]).toFixed(2)} ${(margin.top + plotHeight).toFixed(2)} L ${x(years[0]).toFixed(2)} ${(margin.top + plotHeight).toFixed(2)} Z`;

  const yTicks = 4;
  const tickMarks = Array.from({ length: yTicks + 1 }, (_, index) => Math.round((maxScholars / yTicks) * index));

  svg.innerHTML = `
    <defs>
      <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="rgba(200, 93, 58, 0.35)" />
        <stop offset="100%" stop-color="rgba(200, 93, 58, 0.02)" />
      </linearGradient>
    </defs>
    ${tickMarks
      .map((tick) => {
        const yPos = y(tick);
        return `
          <line x1="${margin.left}" y1="${yPos}" x2="${width - margin.right}" y2="${yPos}" stroke="rgba(79,59,46,0.12)" />
          <text x="${margin.left - 10}" y="${yPos + 4}" text-anchor="end" font-size="11" fill="rgba(101,88,79,1)">${tick}</text>
        `;
      })
      .join("")}
    <path d="${areaPath}" fill="url(#areaFill)"></path>
    <path d="${linePath}" fill="none" stroke="#c85d3a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
    ${data
      .map((item) => {
        const cx = x(item.cohort_year);
        const cy = y(item.scholars);
        return `
          <circle cx="${cx}" cy="${cy}" r="5" fill="#f8f1e8" stroke="#8d3425" stroke-width="3"></circle>
          <text x="${cx}" y="${height - 16}" text-anchor="middle" font-size="11" fill="rgba(101,88,79,1)">${item.cohort_year}</text>
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
      record.email,
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
              <span>${record.email ?? "No email listed"}</span>
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
  document.body.innerHTML = `<main class="page-shell"><section class="directory-panel"><h1>Dashboard unavailable</h1><p>${error.message}</p></section></main>`;
});
