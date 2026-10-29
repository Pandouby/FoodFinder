import { AMENITIES, MAX_STOPS, RADIUS } from "./config.js";
import { formatDistance, formatDuration } from "./format.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const SOURCE_NOTES = {
  osrm: "Walking times come from OpenStreetMap foot routing.",
  estimate: "No walking route was available, so times are estimated from the straight-line distance.",
};

// The settings panel: stop list, start point, radius and the tour result.
export function createWidget(handlers) {
  const $form = $("#tour-form");
  const $select = $("#amenity-select");
  const $addButton = $("#add-stop");
  const $stopList = $("#stop-list");
  const $stopsHint = $("#stops-hint");
  const $startHint = $("#start-hint");
  const $range = $("#radius-range");
  const $number = $("#radius-number");
  const $submit = $("#find-tour");
  const $error = $("#form-error");
  const $tour = $("#tour");
  const $stale = $("#tour-stale");
  const $signpost = $("#signpost");
  const $total = $("#tour-total");
  const $source = $("#tour-source");
  const $reroll = $("#reroll");

  let hasStart = false;
  let loading = false;

  $.each(AMENITIES, (value, { label }) => {
    $("<option>", { value, text: label }).appendTo($select);
  });
  $range.add($number).attr({ min: RADIUS.min, max: RADIUS.max, step: RADIUS.step }).val(RADIUS.initial);

  // --- Stops ---------------------------------------------------------------

  function stops() {
    return $stopList.children().map((_, item) => item.dataset.amenity).get();
  }

  function addStop(amenity) {
    if (stops().length >= MAX_STOPS) return;
    const { label, color } = AMENITIES[amenity];
    $("<li>", { class: "stop-item", tabindex: 0, "data-amenity": amenity })
      .css("--amenity-color", color)
      .append(
        $("<span>", { class: "stop-item__label", text: label }),
        $("<button>", { type: "button", class: "stop-item__remove", "aria-label": `Remove ${label}`, text: "×" }),
      )
      .appendTo($stopList);
    stopsChanged();
  }

  function removeStop($item) {
    const $next = $item.next().length ? $item.next() : $item.prev();
    $item.remove();
    ($next.length ? $next : $addButton).trigger("focus");
    stopsChanged();
  }

  function stopsChanged() {
    const count = stops().length;
    $addButton.prop("disabled", count >= MAX_STOPS);
    if (count === 0) {
      $stopsHint.text("Add at least one stop.");
    } else if (count >= MAX_STOPS) {
      $stopsHint.text(`That's the maximum of ${MAX_STOPS} stops.`);
    } else {
      $stopsHint.text("Drag stops into the order you want to visit them, or use Alt + arrow keys.");
    }
    updateSubmit();
    handlers.onStopsChange(stops());
  }

  $stopList.sortable({
    axis: "y",
    containment: "parent",
    tolerance: "pointer",
    placeholder: "stop-item stop-item--placeholder",
    update: stopsChanged,
  });

  $addButton.on("click", () => addStop($select.val()));

  $stopList.on("click", ".stop-item__remove", function () {
    removeStop($(this).closest(".stop-item"));
  });

  $stopList.on("keydown", ".stop-item", function (event) {
    if (event.target !== this) return;
    const $item = $(this);
    if (event.altKey && event.key === "ArrowUp" && $item.prev().length) {
      $item.prev().before($item);
    } else if (event.altKey && event.key === "ArrowDown" && $item.next().length) {
      $item.next().after($item);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      removeStop($item);
      return;
    } else {
      return;
    }
    event.preventDefault();
    $item.trigger("focus");
    stopsChanged();
  });

  // --- Radius ------------------------------------------------------------

  function radius() {
    return Number($range.val());
  }

  function commitNumber() {
    const typed = Math.round(Number($number.val()) / RADIUS.step) * RADIUS.step;
    const value = Math.min(RADIUS.max, Math.max(RADIUS.min, typed || RADIUS.initial));
    $number.val(value);
    if (value !== radius()) {
      $range.val(value);
      handlers.onRadiusChange(value);
    }
  }

  $range.on("input", () => {
    $number.val($range.val());
    handlers.onRadiusChange(radius());
  });
  $number.on("change", commitNumber);

  // --- Submit --------------------------------------------------------------

  function updateSubmit() {
    $submit.prop("disabled", loading || !hasStart || stops().length === 0);
  }

  $form.on("submit", (event) => {
    event.preventDefault();
    commitNumber();
    handlers.onSubmit();
  });
  $reroll.on("click", () => handlers.onSubmit());
  $("#heatmap-toggle").on("change", function () {
    handlers.onHeatmapToggle(this.checked);
  });

  // --- Tour result as a signpost -------------------------------------------

  function renderSign(stop, tour, index) {
    const { label, color } = AMENITIES[stop.amenity];
    const $sign = $("<li>", { class: "sign" }).css({ "--amenity-color": color, "--i": index });
    const $number = $("<span>", { class: "sign__number", text: stop.position });

    if (!stop.poi) {
      return $sign.append(
        $("<div>", { class: "sign__plate sign__plate--missing" }).append(
          $number,
          $("<span>", { class: "sign__text" }).append(
            $("<span>", { class: "sign__name", text: `No ${label.toLowerCase()} within ${formatDistance(tour.radius_m)}` }),
            $("<span>", { class: "sign__meta", text: "Skipped. Try a larger radius." }),
          ),
        ),
      );
    }

    return $sign.append(
      $("<button>", { type: "button", class: "sign__plate", "data-position": stop.position }).append(
        $number,
        $("<span>", { class: "sign__text" }).append(
          $("<span>", { class: "sign__name", text: stop.poi.name }),
          $("<span>", { class: "sign__meta", text: `${label}, ${formatDistance(stop.leg.distance_m)}` }),
        ),
        $("<span>", { class: "sign__time", text: formatDuration(stop.leg.duration_s) }),
      ),
    );
  }

  $signpost.on("click", ".sign__plate[data-position]", function () {
    handlers.onSignSelect(Number(this.dataset.position));
  });
  $signpost.on("mouseenter focusin", ".sign__plate[data-position]", function () {
    handlers.onSignHover(Number(this.dataset.position));
  });
  $signpost.on("mouseleave focusout", ".sign__plate[data-position]", () => handlers.onSignHover(null));

  return {
    stops,
    radius,

    setStart(latlng) {
      hasStart = true;
      $startHint.text(`Starting at ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}. Drag the pin or click elsewhere to move it.`);
      updateSubmit();
    },

    setLoading(isLoading) {
      loading = isLoading;
      $submit.text(isLoading ? "Finding places…" : "Find a tour");
      $reroll.prop("disabled", isLoading);
      updateSubmit();
    },

    showError(message) {
      $error.text(message).prop("hidden", false);
    },

    clearError() {
      $error.text("").prop("hidden", true);
    },

    markStale() {
      if ($tour.prop("hidden")) return;
      $tour.addClass("is-stale");
      $stale.prop("hidden", false);
    },

    showTour(tour) {
      $signpost.empty();
      $("<li>", { class: "signpost__start" })
        .append(
          $("<span>", { class: "signpost__start-label", text: "Start" }),
          $("<span>", { class: "signpost__start-meta", text: `within ${formatDistance(tour.radius_m)}` }),
        )
        .appendTo($signpost);
      tour.stops.forEach((stop, index) => renderSign(stop, tour, index).appendTo($signpost));

      const found = tour.stops.some((stop) => stop.poi);
      $total.text(
        found
          ? `Total ${formatDistance(tour.total.distance_m)}, about ${formatDuration(tour.total.duration_s)} on foot`
          : "No places found. Try a larger radius or move the start pin.",
      );
      $source.text(SOURCE_NOTES[tour.route.source] || "");
      $reroll.prop("hidden", !found);

      $stale.prop("hidden", true);
      $tour.removeClass("is-stale").prop("hidden", false);
      $tour[0].scrollIntoView({ block: "nearest", behavior: reducedMotion.matches ? "auto" : "smooth" });
    },
  };
}
