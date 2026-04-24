const africaState = {
  data: null,
  years: [],
  selectedYear: null,
  geoFeatures: [],
};

const numberFormat = (value) => new Intl.NumberFormat("en-US").format(value ?? 0);

const AFRICA_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon",
  "Cape Verde", "Central African Republic", "Chad", "Comoros", "Congo", "Republic of the Congo",
  "Democratic Republic of the Congo", "Dem. Rep. Congo", "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini",
  "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Guinea Bissau", "Ivory Coast",
  "Côte d'Ivoire", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi", "Mali",
  "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia", "Niger", "Nigeria", "Rwanda",
  "Senegal", "Sierra Leone", "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania", "United Republic of Tanzania",
  "Togo", "Tunisia", "Uganda", "Zambia", "Zimbabwe", "Western Sahara", "Sao Tome and Principe",
]);

const COUNTRY_ALIASES = {
  "Côte d'Ivoire": "Ivory Coast",
  "Cote d'Ivoire": "Ivory Coast",
  "Republic of the Congo": "Congo",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Democratic Republic of Congo": "Dem. Rep. Congo",
  DRC: "Dem. Rep. Congo",
  "United Republic of Tanzania": "Tanzania",
  "Guinea Bissau": "Guinea-Bissau",
};

function normalizeCountryName(name) {
  return COUNTRY_ALIASES[name] ?? name;
}

async function loadInsights() {
  const response = await fetch("./data/dashboard.json");
  if (!response.ok) {
    throw new Error("Could not load dashboard data.");
  }

  africaState.data = await response.json();
  africaState.years = [...new Set(africaState.data.series.geographyTimeline.map((item) => item.cohort_year))].sort((a, b) => a - b);
  africaState.selectedYear = africaState.years[0];

  renderSurveyOverview();
  renderExecutiveSummary();
  renderSurveyCards();
  wireSlider();
  await loadAfricaGeo();
  renderGeography();
}

function renderSurveyOverview() {
  const { impactQuestions, opportunityQuestions } = africaState.data.survey;
  const leadImpact = impactQuestions[0];
  const leadOpportunity =
    opportunityQuestions.find((question) => question.label.toLowerCase().includes("in-person regional meetups")) ??
    opportunityQuestions[0];

  document.getElementById("hero-impact-share").textContent = `${leadImpact.topScoreShare ?? "—"}%`;
  document.getElementById("hero-opportunity-share").textContent = `${leadOpportunity.topScoreShare ?? "—"}%`;
}

function renderExecutiveSummary() {
  const latestYear = africaState.data.metrics.latestCohort.year;
  const latestScholars = africaState.data.metrics.latestCohort.scholars;
  const topCountry = africaState.data.series.topCountries[0];
  const topInstitution = africaState.data.series.topInstitutions[0];
  const leadImpact = africaState.data.survey.impactQuestions[0];
  const meetupInterest =
    africaState.data.survey.opportunityQuestions.find((question) =>
      question.label.toLowerCase().includes("in-person regional meetups")
    ) ?? africaState.data.survey.opportunityQuestions[0];

  const cards = [
    {
      stat: `${leadImpact.topScoreShare}%`,
      title: "Strong professional development signal",
      body: `Respondents overwhelmingly gave the highest observed score when asked whether UMAPS positively impacted their professional development.`,
    },
    {
      stat: `${meetupInterest.topScoreShare}%`,
      title: "Clear demand for continued programming",
      body: `Interest is especially strong for ${shortenLabel(meetupInterest.label)}, suggesting alumni appetite for sustained engagement beyond the residency.`,
    },
    {
      stat: `${numberFormat(topCountry.scholars)}`,
      title: "Deepest country representation",
      body: `${topCountry.country_of_origin} currently has the largest scholar footprint in the alumni dataset, showing where the network is most concentrated today.`,
    },
    {
      stat: `${numberFormat(topInstitution.scholars)}`,
      title: "Most represented home institution",
      body: `${topInstitution.institution_home} appears most often in the alumni data, making it a strong candidate for future partnership storytelling or outreach.`,
    },
    {
      stat: `${numberFormat(latestScholars)}`,
      title: "Momentum in the latest data year",
      body: `The latest cohort year in the dataset is ${latestYear}, with ${numberFormat(latestScholars)} scholar records already represented.`,
    },
    {
      stat: `${numberFormat(africaState.data.metrics.countries)}`,
      title: "Continental reach",
      body: `The alumni network now spans ${numberFormat(africaState.data.metrics.countries)} represented countries, giving stakeholders a concrete view of regional breadth.`,
    },
  ];

  document.getElementById("executive-summary").innerHTML = cards
    .map(
      (card) => `
        <article class="summary-card">
          <strong>${card.stat}</strong>
          <h3>${card.title}</h3>
          <p>${card.body}</p>
        </article>
      `
    )
    .join("");
}

function renderSurveyCards() {
  renderQuestionCards("impact-cards", africaState.data.survey.impactQuestions);
  renderQuestionCards("opportunity-cards", africaState.data.survey.opportunityQuestions);
}

function renderQuestionCards(targetId, questions) {
  document.getElementById(targetId).innerHTML = questions
    .map(
      (question) => `
        <article class="survey-card">
          <h3>${cleanQuestionLabel(question.label)}</h3>
          <strong>${question.average ?? "—"} / ${question.maxScore ?? "—"}</strong>
          <p>${question.topScoreShare ?? "—"}% of respondents selected ${question.maxScore ?? "—"}.</p>
        </article>
      `
    )
    .join("");
}

function shortenLabel(label) {
  const parts = label.split(" - ");
  return parts[parts.length - 1].replace(/^Would you be interested in the following future opportunities\? \(e\.g\., virtual workshops, mentorship\)\s*/i, "");
}

function cleanQuestionLabel(label) {
  return String(label ?? "")
    .replace(/^Impact and Benefits of the UMAPS Program\s*-\s*/i, "")
    .replace(/^Would you be interested in the following future opportunities\?\s*(\(e\.g\., virtual workshops, mentorship\))?\s*/i, "")
    .trim();
}

function wireSlider() {
  const slider = document.getElementById("year-slider");
  slider.min = 0;
  slider.max = africaState.years.length - 1;
  slider.value = 0;
  document.getElementById("selected-year").textContent = africaState.selectedYear;
  slider.addEventListener("input", (event) => {
    africaState.selectedYear = africaState.years[Number(event.target.value)];
    document.getElementById("selected-year").textContent = africaState.selectedYear;
    renderGeography();
  });
}

async function loadAfricaGeo() {
  const response = await fetch("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson");
  const geojson = await response.json();
  africaState.geoFeatures = geojson.features.filter((feature) => AFRICA_COUNTRIES.has(feature.properties.name));
}

function cumulativeCountryCounts() {
  const counts = new Map();
  africaState.data.series.geographyTimeline
    .filter((item) => item.cohort_year <= africaState.selectedYear)
    .forEach((item) => {
      const country = normalizeCountryName(item.country_of_origin);
      counts.set(country, (counts.get(country) ?? 0) + item.scholars);
    });
  return counts;
}

function getCountryDetails(countryName) {
  const matchingRecords = africaState.data.records.filter((record) => {
    if (!record.country || !record.cohortYear) return false;
    return normalizeCountryName(record.country) === countryName && record.cohortYear <= africaState.selectedYear;
  });

  const cumulativeParticipations = matchingRecords.length;
  const firstYear = matchingRecords.length
    ? Math.min(...matchingRecords.map((record) => record.cohortYear))
    : null;
  const institutions = new Set(matchingRecords.map((record) => record.institution).filter(Boolean));

  return {
    cumulativeParticipations,
    firstYear,
    institutionCount: institutions.size,
  };
}

function renderGeography() {
  const counts = cumulativeCountryCounts();
  renderYearSummary(counts);
  renderGenderBars();
  renderTimelineBars(counts);
  renderMap(counts);
}

function renderGenderBars() {
  const container = document.getElementById("gender-bars");
  const counts = new Map();

  africaState.data.records
    .filter((record) => record.cohortYear && record.cohortYear <= africaState.selectedYear && record.gender)
    .forEach((record) => {
      counts.set(record.gender, (counts.get(record.gender) ?? 0) + 1);
    });

  const items = ["Female", "Male"]
    .map((label) => ({ label, count: counts.get(label) ?? 0 }))
    .filter((item) => item.count > 0);

  if (!items.length) {
    container.innerHTML = `<div class="empty-state">No gender data available for the selected year.</div>`;
    return;
  }

  const max = Math.max(...items.map((item) => item.count), 1);
  container.innerHTML = items
    .map(
      (item) => `
        <div class="bar-row">
          <div class="bar-meta">
            <span class="bar-label">${item.label}</span>
            <span class="bar-value">${numberFormat(item.count)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(item.count / max) * 100}%"></div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderYearSummary(counts) {
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const totalScholars = entries.reduce((sum, [, count]) => sum + count, 0);
  const topCountry = entries[0]?.[0] ?? "No country yet";

  document.getElementById("year-summary").innerHTML = `
    <div class="summary-chip">
      <strong>${numberFormat(entries.length)}</strong>
      <span>African countries represented by ${africaState.selectedYear}</span>
    </div>
    <div class="summary-chip">
      <strong>${numberFormat(totalScholars)}</strong>
      <span>Cumulative scholar participations by ${africaState.selectedYear}</span>
    </div>
    <div class="summary-chip">
      <strong>${topCountry}</strong>
      <span>Largest represented country to date</span>
    </div>
  `;
}

function renderTimelineBars(counts) {
  const container = document.getElementById("timeline-country-bars");
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">No countries represented yet for the selected year.</div>`;
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);
  container.innerHTML = `
    <div class="vertical-country-bars">
      ${entries
        .map(
          ([country, count]) => `
            <div class="vertical-country-bar">
              <span class="vertical-country-value">${numberFormat(count)}</span>
              <div class="vertical-country-track">
                <div class="vertical-country-fill" style="height: ${(count / max) * 100}%"></div>
              </div>
              <span class="vertical-country-label">${country}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderMap(counts) {
  const svg = d3.select("#africa-map");
  svg.selectAll("*").remove();
  const tooltip = document.getElementById("map-tooltip");
  tooltip.hidden = true;

  if (!africaState.geoFeatures.length) {
    return;
  }

  const width = 760;
  const height = 520;
  const projection = d3.geoMercator().fitExtent([[30, 20], [width - 30, height - 20]], {
    type: "FeatureCollection",
    features: africaState.geoFeatures,
  });
  const path = d3.geoPath(projection);

  const mapEntries = africaState.geoFeatures.map((feature) => {
    const name = feature.properties.name;
    const normalized = normalizeCountryName(name);
    return {
      feature,
      count: counts.get(normalized) ?? counts.get(name) ?? 0,
      label: normalized,
    };
  });

  const maxCount = d3.max(mapEntries, (item) => item.count) || 1;
  const nonZeroCounts = mapEntries.map((item) => item.count).filter((count) => count > 0);
  const minNonZeroCount = nonZeroCounts.length ? d3.min(nonZeroCounts) : 1;
  const color = d3.scaleSqrt().domain([minNonZeroCount, maxCount]).range(["#9fb9d9", "#00274c"]);

  svg
    .append("g")
    .selectAll("path")
    .data(mapEntries)
    .join("path")
    .attr("d", (item) => path(item.feature))
    .attr("fill", (item) => {
      if (item.count <= 0) {
        return "#edf3f8";
      }
      return color(item.count);
    })
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.2)
    .on("mousemove", (event, item) => {
      const details = getCountryDetails(item.label);
      tooltip.hidden = false;
      tooltip.style.left = `${event.offsetX + 18}px`;
      tooltip.style.top = `${event.offsetY + 18}px`;
      tooltip.innerHTML = `
        <strong>${item.label}</strong>
        <p>Cumulative scholar participations by ${africaState.selectedYear}: ${numberFormat(details.cumulativeParticipations)}</p>
        <p>First scholar participation year: ${details.firstYear ?? "No records yet"}</p>
        <p>Universities represented: ${numberFormat(details.institutionCount)}</p>
      `;
    })
    .on("mouseleave", () => {
      tooltip.hidden = true;
    });

  const legend = svg.append("g").attr("transform", "translate(28, 464)");
  const gradientId = "map-gradient";
  const defs = svg.append("defs");
  const gradient = defs.append("linearGradient").attr("id", gradientId);
  gradient.append("stop").attr("offset", "0%").attr("stop-color", "#9fb9d9");
  gradient.append("stop").attr("offset", "100%").attr("stop-color", "#00274c");
  legend.append("rect").attr("width", 180).attr("height", 14).attr("rx", 7).attr("fill", `url(#${gradientId})`);
  legend.append("text").attr("x", 0).attr("y", -8).attr("fill", "#4f6074").attr("font-size", 12).text("Cumulative scholar count");
  legend.append("text").attr("x", 0).attr("y", 34).attr("fill", "#4f6074").attr("font-size", 12).text(numberFormat(minNonZeroCount));
  legend.append("text").attr("x", 180).attr("y", 34).attr("text-anchor", "end").attr("fill", "#4f6074").attr("font-size", 12).text(numberFormat(maxCount));
}

loadInsights().catch((error) => {
  document.body.innerHTML = `<main class="site-shell"><section class="panel-card"><h1>Insights unavailable</h1><p>${error.message}</p></section></main>`;
});
