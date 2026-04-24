const engagementState = {
  data: null,
  geoFeatures: [],
  filters: {
    query: "",
    projectType: "",
    college: "",
    country: "",
  },
  selectedProjectNo: "",
  sort: {
    key: "projectTitle",
    direction: "asc",
  },
};

const AFRICA_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Cameroon",
  "Cape Verde", "Central African Republic", "Chad", "Comoros", "Congo", "Republic of the Congo",
  "Democratic Republic of the Congo", "Dem. Rep. Congo", "Djibouti", "Egypt", "Equatorial Guinea",
  "Eritrea", "Eswatini", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau",
  "Guinea Bissau", "Ivory Coast", "Côte d'Ivoire", "Kenya", "Lesotho", "Liberia", "Libya",
  "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", "Namibia",
  "Niger", "Nigeria", "Rwanda", "Senegal", "Sierra Leone", "Somalia", "South Africa",
  "South Sudan", "Sudan", "Tanzania", "United Republic of Tanzania", "Togo", "Tunisia",
  "Uganda", "Zambia", "Zimbabwe", "Western Sahara", "Sao Tome and Principe",
]);

const COUNTRY_ALIASES = {
  "Côte d'Ivoire": "Ivory Coast",
  "Cote d'Ivoire": "Ivory Coast",
  "Republic of the Congo": "Congo",
  Congo: "Congo",
  "Democratic Republic of the Congo": "Dem. Rep. Congo",
  "Democratic Republic of Congo": "Dem. Rep. Congo",
  DRC: "Dem. Rep. Congo",
  "United Republic of Tanzania": "Tanzania",
  "Guinea Bissau": "Guinea-Bissau",
};

const TYPE_META = {
  Research: { glyph: "●", shape: d3.symbolCircle, color: "#00274c" },
  "Capacity Building": { glyph: "■", shape: d3.symbolSquare, color: "#75988d" },
  Teaching: { glyph: "▲", shape: d3.symbolTriangle, color: "#d86018" },
  "Research Capacity Program": { glyph: "◆", shape: d3.symbolDiamond, color: "#9a3324" },
  Other: { glyph: "●", shape: d3.symbolCircle, color: "#4f6074" },
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value ?? 0);

function normalizeCountryName(name) {
  return COUNTRY_ALIASES[name] ?? name;
}

function getTypeMeta(type) {
  return TYPE_META[type] ?? TYPE_META.Other;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadEngagement() {
  const response = await fetch("./data/engagement.json");
  if (!response.ok) {
    throw new Error("Could not load engagement data.");
  }

  engagementState.data = await response.json();
  renderHeroMetrics();
  populateFilters();
  wireEvents();
  await loadAfricaGeo();
  renderLegend();
  renderAll();
}

function renderHeroMetrics() {
  const { metrics } = engagementState.data;
  document.getElementById("engagement-total-projects").textContent = formatNumber(metrics.totalProjects);
  document.getElementById("engagement-total-countries").textContent = formatNumber(metrics.countries);
}

function populateFilters() {
  const projectType = document.getElementById("engagement-project-type");
  const college = document.getElementById("engagement-college");
  const country = document.getElementById("engagement-country");

  const typeValues = [...new Set(engagementState.data.records.map((record) => record.projectType).filter(Boolean))].sort();
  const collegeValues = [...new Set(engagementState.data.records.map((record) => record.college).filter(Boolean))].sort();
  const countryValues = [...new Set(engagementState.data.records.map((record) => record.country).filter(Boolean))].sort();

  projectType.innerHTML += typeValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  college.innerHTML += collegeValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  country.innerHTML += countryValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function wireEvents() {
  document.getElementById("engagement-search").addEventListener("input", (event) => {
    engagementState.filters.query = event.target.value.trim().toLowerCase();
    renderAll();
  });
  document.getElementById("engagement-project-type").addEventListener("change", (event) => {
    engagementState.filters.projectType = event.target.value;
    renderAll();
  });
  document.getElementById("engagement-college").addEventListener("change", (event) => {
    engagementState.filters.college = event.target.value;
    renderAll();
  });
  document.getElementById("engagement-country").addEventListener("change", (event) => {
    engagementState.filters.country = event.target.value;
    renderAll();
  });

  document.querySelectorAll("[data-engagement-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.engagementSort;
      if (engagementState.sort.key === key) {
        engagementState.sort.direction = engagementState.sort.direction === "asc" ? "desc" : "asc";
      } else {
        engagementState.sort.key = key;
        engagementState.sort.direction = "asc";
      }
      renderDirectory(getFilteredRecords());
    });
  });
}

function compareEngagementValues(a, b, key) {
  return String(a[key] ?? "").localeCompare(String(b[key] ?? ""), undefined, { sensitivity: "base" });
}

function updateEngagementSortUi() {
  document.querySelectorAll("[data-engagement-sort]").forEach((button) => {
    const isActive = button.dataset.engagementSort === engagementState.sort.key;
    button.classList.toggle("is-active", isActive);
    button.dataset.direction = isActive ? engagementState.sort.direction : "";
  });
}

async function loadAfricaGeo() {
  const response = await fetch("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson");
  const geojson = await response.json();
  engagementState.geoFeatures = geojson.features.filter((feature) => AFRICA_COUNTRIES.has(feature.properties.name));
}

function getFilteredRecords() {
  const { query, projectType, college, country } = engagementState.filters;
  return engagementState.data.records.filter((record) => {
    const matchesType = !projectType || record.projectType === projectType;
    const matchesCollege = !college || record.college === college;
    const matchesCountry = !country || record.country === country;
    const haystack = [
      record.projectTitle,
      record.piName,
      record.college,
      record.country,
      record.city,
      record.projectDescription,
      record.collaborators,
      record.fundingSource,
      record.projectType,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesType && matchesCollege && matchesCountry && matchesQuery;
  });
}

function renderAll() {
  const records = getFilteredRecords();
  if (engagementState.selectedProjectNo && !records.some((record) => record.projectNo === engagementState.selectedProjectNo)) {
    engagementState.selectedProjectNo = records[0]?.projectNo ?? "";
  }
  renderSummary(records);
  renderCountryBars(records);
  renderTypeBars(records);
  renderCollegeBars(records);
  renderMap(records);
  renderDirectory(records);
  renderProjectDetail(records);
}

function renderLegend() {
  const items = ["Research", "Capacity Building", "Teaching", "Research Capacity Program"];
  document.getElementById("engagement-legend").innerHTML = items
    .map((type) => {
      const meta = getTypeMeta(type);
      return `<span class="type-badge"><span class="type-glyph" style="color: ${meta.color}">${meta.glyph}</span><span>${type}</span></span>`;
    })
    .join("");
}

function renderSummary(records) {
  const mappedRecords = records.filter((record) => record.mapCountry);
  const mappedCountries = new Set(mappedRecords.map((record) => normalizeCountryName(record.mapCountry)));
  const colleges = new Set(records.map((record) => record.college).filter(Boolean));
  const regionalProjects = records.filter((record) => record.countryScope === "regional").length;

  document.getElementById("engagement-summary").innerHTML = `
    <div class="summary-chip">
      <strong>${formatNumber(records.length)}</strong>
      <span>Visible projects after filtering</span>
    </div>
    <div class="summary-chip">
      <strong>${formatNumber(mappedCountries.size)}</strong>
      <span>Mapped African countries in the current view</span>
    </div>
    <div class="summary-chip">
      <strong>${formatNumber(colleges.size)}</strong>
      <span>U-M college affiliations in the current view</span>
    </div>
    <div class="summary-chip">
      <strong>${formatNumber(regionalProjects)}</strong>
      <span>Regional or multi-country entries in the current view</span>
    </div>
  `;
}

function renderCountryBars(records) {
  const counts = new Map();
  records
    .filter((record) => record.mapCountry)
    .forEach((record) => {
      const country = normalizeCountryName(record.mapCountry);
      counts.set(country, (counts.get(country) ?? 0) + 1);
    });

  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const container = document.getElementById("engagement-country-bars");
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">No country-specific projects match the current filters.</div>`;
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);
  container.innerHTML = entries
    .map(([country, count]) => {
      const active = engagementState.filters.country === country ? " is-active" : "";
      return `
        <button class="bar-row bar-button${active}" data-country="${escapeHtml(country)}" type="button">
          <div class="bar-meta">
            <span class="bar-label">${country}</span>
            <span class="bar-value">${formatNumber(count)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(count / max) * 100}%"></div>
          </div>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll("[data-country]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextCountry = button.dataset.country;
      engagementState.filters.country = engagementState.filters.country === nextCountry ? "" : nextCountry;
      document.getElementById("engagement-country").value = engagementState.filters.country;
      renderAll();
    });
  });
}

function renderTypeBars(records) {
  const counts = new Map();
  records.forEach((record) => {
    counts.set(record.projectType, (counts.get(record.projectType) ?? 0) + 1);
  });

  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const container = document.getElementById("engagement-type-bars");
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">No project types match the current filters.</div>`;
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);
  container.innerHTML = entries
    .map(([type, count]) => {
      const meta = getTypeMeta(type);
      return `
        <div class="bar-row">
          <div class="bar-meta">
            <span class="bar-label"><span class="type-glyph" style="color: ${meta.color}">${meta.glyph}</span> ${type}</span>
            <span class="bar-value">${formatNumber(count)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(count / max) * 100}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderCollegeBars(records) {
  const counts = new Map();
  records.forEach((record) => {
    counts.set(record.college, (counts.get(record.college) ?? 0) + 1);
  });

  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const container = document.getElementById("engagement-college-bars");
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state">No college affiliations match the current filters.</div>`;
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);
  container.innerHTML = entries
    .map(
      ([college, count]) => `
        <div class="bar-row">
          <div class="bar-meta">
            <span class="bar-label">${college}</span>
            <span class="bar-value">${formatNumber(count)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${(count / max) * 100}%"></div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderMap(records) {
  const svg = d3.select("#engagement-map");
  svg.selectAll("*").remove();
  svg.on(".zoom", null);
  const tooltip = document.getElementById("engagement-map-tooltip");
  tooltip.hidden = true;

  if (!engagementState.geoFeatures.length) {
    return;
  }

  const width = 760;
  const height = 520;
  svg
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("rx", 18)
    .attr("fill", "#f7fafc");
  const mapLayer = svg.append("g");
  const markerLayer = svg.append("g");
  const projection = d3.geoMercator().fitExtent([[30, 20], [width - 30, height - 20]], {
    type: "FeatureCollection",
    features: engagementState.geoFeatures,
  });
  const path = d3.geoPath(projection);

  mapLayer
    .append("g")
    .selectAll("path")
    .data(engagementState.geoFeatures)
    .join("path")
    .attr("d", (item) => path(item))
    .attr("fill", "#dfe8f2")
    .attr("stroke", "#5f7893")
    .attr("stroke-width", 1.45);

  const featureByCountry = new Map(
    engagementState.geoFeatures.map((feature) => [normalizeCountryName(feature.properties.name), feature])
  );

  const mappedRecords = records.filter((record) => record.mapCountry);
  const pointData = [];

  [...d3.group(mappedRecords, (record) => normalizeCountryName(record.mapCountry)).entries()].forEach(
    ([country, group]) => {
      const feature = featureByCountry.get(country);
      if (!feature) return;
      const [cx, cy] = path.centroid(feature);
      group.forEach((record, index) => {
        const angle = index * 2.399963229728653;
        const radius = index === 0 ? 0 : 7 + Math.floor(index / 8) * 4;
        pointData.push({
          ...record,
          baseX: cx,
          baseY: cy,
          offsetX: Math.cos(angle) * radius,
          offsetY: Math.sin(angle) * radius,
        });
      });
    }
  );

  const markers = markerLayer
    .append("g")
    .selectAll("path")
    .data(pointData)
    .join("path")
    .attr(
      "transform",
      (item) => `translate(${item.baseX + item.offsetX},${item.baseY + item.offsetY})`
    )
    .attr("d", (item) => d3.symbol().type(getTypeMeta(item.projectType).shape).size(68)())
    .attr("fill", (item) => getTypeMeta(item.projectType).color)
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 1.3)
    .attr("opacity", 0.92)
    .attr("cursor", "pointer")
    .classed("is-selected", (item) => item.projectNo === engagementState.selectedProjectNo)
    .on("mousemove", (event, item) => {
      tooltip.hidden = false;
      tooltip.style.left = `${event.offsetX + 18}px`;
      tooltip.style.top = `${event.offsetY + 18}px`;
      tooltip.innerHTML = `
        <strong>${escapeHtml(item.projectTitle)}</strong>
        <p><strong>PI:</strong> ${escapeHtml(item.piName)}</p>
        <p><strong>Type:</strong> ${escapeHtml(item.projectType)}</p>
        <p><strong>College:</strong> ${escapeHtml(item.college)}</p>
        <p><strong>Location:</strong> ${escapeHtml(item.country)}${item.city ? `, ${escapeHtml(item.city)}` : ""}</p>
        <p><strong>Funding:</strong> ${escapeHtml(item.fundingSource ?? "Not listed")}${item.fundingDuration ? ` · ${escapeHtml(item.fundingDuration)}` : ""}</p>
      `;
    })
    .on("mouseleave", () => {
      tooltip.hidden = true;
    })
    .on("click", (_event, item) => {
      engagementState.selectedProjectNo = item.projectNo;
      renderAll();
    });

  function updateMarkerPositions(transform = d3.zoomIdentity) {
    markers
      .attr(
        "transform",
        (item) =>
          `translate(${transform.applyX(item.baseX + item.offsetX)},${transform.applyY(item.baseY + item.offsetY)})`
      )
      .attr("stroke-width", (item) => (item.projectNo === engagementState.selectedProjectNo ? 2.2 : 1.3));
  }

  updateMarkerPositions();

  svg.call(
    d3
      .zoom()
      .scaleExtent([1, 6])
      .on("zoom", (event) => {
        mapLayer.attr("transform", event.transform);
        updateMarkerPositions(event.transform);
      })
  );
}

function renderDirectory(records) {
  const body = document.getElementById("engagement-directory-body");
  document.getElementById("engagement-results-count").textContent = `${formatNumber(records.length)} matching projects`;
  updateEngagementSortUi();

  if (!records.length) {
    body.innerHTML = `<tr><td class="empty-state" colspan="7">No projects match the current filters.</td></tr>`;
    return;
  }

  body.innerHTML = [...records]
    .sort((a, b) => {
      const result = compareEngagementValues(a, b, engagementState.sort.key);
      return engagementState.sort.direction === "asc" ? result : -result;
    })
    .slice(0, 200)
    .map((record) => {
      const meta = getTypeMeta(record.projectType);
      const active = record.projectNo === engagementState.selectedProjectNo ? " class=\"is-selected\"" : "";
      return `
        <tr data-project-no="${escapeHtml(record.projectNo)}"${active}>
          <td>
            <div class="name-cell">
              <strong>${escapeHtml(record.projectTitle)}</strong>
              <span>#${record.projectNo}</span>
            </div>
          </td>
          <td><span class="type-badge"><span class="type-glyph" style="color: ${meta.color}">${meta.glyph}</span><span>${escapeHtml(record.projectType)}</span></span></td>
          <td>${escapeHtml(record.piName)}</td>
          <td>${escapeHtml(record.college)}</td>
          <td>${escapeHtml(record.country)}</td>
          <td>${escapeHtml(record.city ?? "—")}</td>
          <td>${escapeHtml(record.fundingSource ?? "—")}</td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("[data-project-no]").forEach((row) => {
    row.addEventListener("click", () => {
      engagementState.selectedProjectNo = row.dataset.projectNo;
      renderAll();
    });
  });
}

function renderProjectDetail(records) {
  const container = document.getElementById("engagement-project-detail");
  const selected =
    records.find((record) => record.projectNo === engagementState.selectedProjectNo) ??
    records[0] ??
    null;

  if (!selected) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  engagementState.selectedProjectNo = selected.projectNo;
  const meta = getTypeMeta(selected.projectType);
  container.hidden = false;
  container.innerHTML = `
    <div class="project-detail-header">
      <div>
        <p class="eyebrow">Selected project</p>
        <h3>${escapeHtml(selected.projectTitle)}</h3>
      </div>
      <span class="type-badge"><span class="type-glyph" style="color: ${meta.color}">${meta.glyph}</span><span>${escapeHtml(selected.projectType)}</span></span>
    </div>
    <div class="project-detail-grid">
      <div>
        <strong>PI</strong>
        <span>${escapeHtml(selected.piName)}</span>
      </div>
      <div>
        <strong>College</strong>
        <span>${escapeHtml(selected.college)}</span>
      </div>
      <div>
        <strong>Location</strong>
        <span>${escapeHtml(selected.country)}${selected.city ? `, ${escapeHtml(selected.city)}` : ""}</span>
      </div>
      <div>
        <strong>Funding</strong>
        <span>${escapeHtml(selected.fundingSource ?? "Not listed")}${selected.fundingDuration ? ` · ${escapeHtml(selected.fundingDuration)}` : ""}</span>
      </div>
      <div>
        <strong>Project number</strong>
        <span>${escapeHtml(selected.projectNo)}</span>
      </div>
      <div>
        <strong>Collaborators</strong>
        <span>${escapeHtml(selected.collaborators ?? "Not listed")}</span>
      </div>
    </div>
    <div class="project-detail-body">
      <strong>Project description</strong>
      <p>${escapeHtml(selected.projectDescription ?? "No description is currently listed for this project.")}</p>
    </div>
  `;
}

loadEngagement().catch((error) => {
  document.body.innerHTML = `<main class="site-shell"><section class="panel-card"><h1>Engagement page unavailable</h1><p>${error.message}</p></section></main>`;
});
