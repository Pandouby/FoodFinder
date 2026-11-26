import { AMENITIES } from "./config.js";
import { formatDistance } from "./format.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const numberFormat = new Intl.NumberFormat("en");
const TYPES = Object.keys(AMENITIES);

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// The right-hand panel with a bar chart of how many places of each type lie
// inside the search radius. Bars keep the fixed order and colours of AMENITIES,
// so they match the markers and don't jump around while the radius changes.
export function createChartPanel({ onClose }) {
  const $panel = $("#chart-panel");
  const $summary = $("#chart-summary");
  const $plot = $("#chart-plot");
  const $message = $("#chart-message");
  const canvas = document.getElementById("chart-canvas");

  const font = token("--font-text");
  const valueFont = `600 13px ${font}`;
  let chart = null;

  // Each count sits just past the end of its bar, so the chart needs no x-axis.
  const valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const values = chart.data.datasets[0].data;
      ctx.save();
      ctx.font = valueFont;
      ctx.fillStyle = token("--text");
      ctx.textBaseline = "middle";
      chart.getDatasetMeta(0).data.forEach((bar, index) => {
        ctx.fillText(numberFormat.format(values[index]), bar.x + 6, bar.y);
      });
      ctx.restore();
    },
  };

  // Room on the right for the widest value label.
  function labelSpace(counts) {
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.font = valueFont;
    const widest = Math.max(...counts.map((count) => ctx.measureText(numberFormat.format(count)).width));
    ctx.restore();
    return Math.ceil(widest) + 12;
  }

  function createChart(counts) {
    return new Chart(canvas, {
      type: "bar",
      data: {
        labels: TYPES.map((type) => AMENITIES[type].label),
        datasets: [
          {
            data: counts,
            backgroundColor: TYPES.map((type) => AMENITIES[type].color),
            hoverBackgroundColor: TYPES.map((type) => AMENITIES[type].color),
            borderRadius: 4,
            borderSkipped: "start",
            maxBarThickness: 24,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion.matches ? false : { duration: 300 },
        layout: { padding: { right: labelSpace(counts) } },
        // The whole row is the hover target, not just the bar.
        interaction: { mode: "index", axis: "y", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: token("--ink"),
            titleFont: { family: font, weight: 600 },
            bodyFont: { family: font },
            displayColors: false,
            callbacks: {
              label({ raw, dataset }) {
                const total = dataset.data.reduce((sum, count) => sum + count, 0);
                const share = total ? Math.round((raw / total) * 100) : 0;
                return `${numberFormat.format(raw)} ${raw === 1 ? "place" : "places"}, ${share} % of all`;
              },
            },
          },
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: {
            grid: { display: false },
            border: { color: token("--line") },
            ticks: { color: token("--text"), font: { family: font, size: 14, weight: 600 } },
          },
        },
      },
      plugins: [valueLabels],
    });
  }

  function showMessage(text, { error = false } = {}) {
    $message.text(text).toggleClass("error", error).toggleClass("hint", !error).prop("hidden", !text);
  }

  // Keeps Leaflet's controls and the map view clear of the open panel.
  new ResizeObserver(() => {
    const visible = !$panel.prop("hidden");
    const root = document.documentElement.style;
    root.setProperty("--chart-offset-x", visible ? `${$panel.outerWidth() + 16}px` : "0px");
    root.setProperty("--chart-offset-y", visible ? `${$panel.outerHeight()}px` : "0px");
  }).observe($panel[0]);

  $("#chart-close").on("click", onClose);
  $panel.on("keydown", (event) => {
    if (event.key === "Escape") onClose();
  });

  return {
    open() {
      $panel.prop("hidden", false);
    },

    close() {
      $panel.prop("hidden", true);
    },

    setLoading(isLoading) {
      $panel.attr("aria-busy", String(isLoading));
    },

    showPrompt() {
      $summary.text("");
      $plot.prop("hidden", true);
      showMessage("Click on the map to set a start point. The chart then counts the places within the search radius.");
    },

    showError(message) {
      $plot.prop("hidden", true);
      showMessage(message, { error: true });
    },

    // `types` is the API answer: [{ amenity, count }, …]
    showCounts(types, radius) {
      const byType = Object.fromEntries(types.map(({ amenity, count }) => [amenity, count]));
      const counts = TYPES.map((type) => byType[type] ?? 0);
      const total = counts.reduce((sum, count) => sum + count, 0);
      const distance = formatDistance(radius);

      if (total === 0) {
        $summary.text(`No places within ${distance}`);
        $plot.prop("hidden", true);
        showMessage("Try a larger radius or move the start pin.");
        return;
      }

      $summary.text(`${numberFormat.format(total)} ${total === 1 ? "place" : "places"} within ${distance}`);
      showMessage("");
      $plot.prop("hidden", false);
      canvas.setAttribute(
        "aria-label",
        `Bar chart of places within ${distance}: ` +
          TYPES.map((type, index) => `${AMENITIES[type].label} ${counts[index]}`).join(", "),
      );

      if (chart) {
        chart.data.datasets[0].data = counts;
        chart.options.layout.padding.right = labelSpace(counts);
        chart.update();
      } else {
        chart = createChart(counts);
      }
    },
  };
}
