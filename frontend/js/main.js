import { AMENITIES } from "./config.js";
import { api, errorMessage } from "./api.js";
import { createChartPanel } from "./chart-panel.js";
import { createMap } from "./map.js";
import { createWidget } from "./widget.js";

const state = { start: null, stops: [], radius: 0, heatmap: false, chart: false };
const heatmapCache = new Map();
let heatmapRequest = 0;
let chartRequest = 0;
let chartTimer = null;

const chartPanel = createChartPanel({
  onClose() {
    state.chart = false;
    chartPanel.close();
    refreshChart();
    widget.uncheckChart();
  },
});

const widget = createWidget({
  onStopsChange(stops) {
    state.stops = stops;
    widget.markStale();
    refreshHeatmap();
  },
  onRadiusChange(radius) {
    state.radius = radius;
    map.setRadius(radius);
    widget.markStale();
    refreshChart();
  },
  onHeatmapToggle(enabled) {
    state.heatmap = enabled;
    refreshHeatmap();
  },
  onChartToggle(enabled) {
    state.chart = enabled;
    enabled ? chartPanel.open() : chartPanel.close();
    refreshChart({ immediate: true });
  },
  onSubmit: findTour,
  onSignSelect: (position) => map.openStop(position),
  onSignHover: (position) => map.highlightStop(position),
});

const map = createMap("map", {
  panel: "#panel",
  chartPanel: "#chart-panel",
  onStartChange(latlng) {
    state.start = latlng;
    widget.setStart(latlng);
    widget.markStale();
    refreshChart();
  },
});

state.radius = widget.radius();
map.setRadius(state.radius);

function findTour() {
  if (!state.start || state.stops.length === 0) return;
  widget.clearError();
  widget.setLoading(true);
  api
    .tour(state)
    .done((tour) => {
      map.showTour(tour);
      widget.showTour(tour);
    })
    .fail((xhr) => widget.showError(errorMessage(xhr)))
    .always(() => widget.setLoading(false));
}

// Heatmap of the types in the stop list, or of all types while it is empty.
function refreshHeatmap() {
  const request = ++heatmapRequest;
  if (!state.heatmap) {
    map.setHeatmap(null);
    return;
  }

  const types = state.stops.length ? [...new Set(state.stops)].sort() : Object.keys(AMENITIES);
  const key = types.join(",");
  if (heatmapCache.has(key)) {
    map.setHeatmap(heatmapCache.get(key));
    return;
  }

  api
    .heatmap(types)
    .done(({ points }) => {
      heatmapCache.set(key, points);
      if (request === heatmapRequest) map.setHeatmap(points);
    })
    .fail((xhr) => widget.showError(errorMessage(xhr)));
}

// Counts per type around the start pin. Waits a moment so dragging the
// radius slider sends one request instead of one per step.
function refreshChart({ immediate = false } = {}) {
  clearTimeout(chartTimer);
  const request = ++chartRequest;
  if (!state.chart) return;
  if (!state.start) {
    chartPanel.showPrompt();
    return;
  }

  chartTimer = setTimeout(() => {
    const { start, radius } = state;
    chartPanel.setLoading(true);
    api
      .counts({ start, radius })
      .done(({ types }) => {
        if (request === chartRequest) chartPanel.showCounts(types, radius);
      })
      .fail((xhr) => {
        if (request === chartRequest) chartPanel.showError(errorMessage(xhr));
      })
      .always(() => {
        if (request === chartRequest) chartPanel.setLoading(false);
      });
  }, immediate ? 0 : 250);
}

// On small screens the panel is a bottom sheet; keep Leaflet's attribution
// and controls above it.
const panel = document.getElementById("panel");
new ResizeObserver(() => {
  document.documentElement.style.setProperty("--sheet-height", `${panel.offsetHeight}px`);
}).observe(panel);
