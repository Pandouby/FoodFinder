import { AMENITIES, HEAT_GRADIENT, SWISS_BOUNDS, TILES } from "./config.js";
import { buildPopup } from "./popup.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileLayout = window.matchMedia("(max-width: 640px)");

const startIcon = L.divIcon({
  className: "start-marker",
  html: '<span class="start-marker__diamond"></span>',
  iconSize: [28, 28],
});

function stopIcon(stop) {
  const { color } = AMENITIES[stop.amenity];
  return L.divIcon({
    className: "stop-marker",
    html: `<span class="stop-marker__dot" style="--amenity-color: ${color}">${stop.position}</span>`,
    iconSize: [30, 30],
    popupAnchor: [0, -16],
  });
}

export function createMap(elementId, { panel, onStartChange }) {
  const map = L.map(elementId, {
    zoomControl: false,
    minZoom: 7,
    maxBounds: L.latLngBounds(SWISS_BOUNDS).pad(0.15),
    maxBoundsViscosity: 0.8,
  });
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer(TILES.url, { attribution: TILES.attribution, maxNativeZoom: TILES.maxNativeZoom, maxZoom: 19 }).addTo(map);

  // leaflet.heat always draws into the overlay pane, so the route gets its
  // own pane above it to stay visible on top of the heatmap.
  map.createPane("route").style.zIndex = 450;

  const tourLayer = L.layerGroup().addTo(map);
  const stopMarkers = new Map();
  let startMarker = null;
  let radiusCircle = null;
  let heatLayer = null;
  let radius = 0;

  // Keeps the map content clear of the floating panel.
  function viewPadding() {
    const $panel = $(panel);
    if (mobileLayout.matches) {
      return { paddingTopLeft: [24, 24], paddingBottomRight: [24, $panel.outerHeight() + 24] };
    }
    return { paddingTopLeft: [$panel.outerWidth() + 48, 24], paddingBottomRight: [24, 24] };
  }

  function fit(bounds) {
    const options = { ...viewPadding(), maxZoom: 17 };
    reducedMotion.matches ? map.fitBounds(bounds, options) : map.flyToBounds(bounds, { ...options, duration: 0.8 });
  }

  function setStart(latlng) {
    if (startMarker) {
      startMarker.setLatLng(latlng);
      radiusCircle.setLatLng(latlng);
    } else {
      radiusCircle = L.circle(latlng, {
        radius,
        interactive: false,
        color: "#000",
        weight: 1.5,
        dashArray: "4 6",
        fillColor: "#F7C600",
        fillOpacity: 0.12,
      }).addTo(map);
      startMarker = L.marker(latlng, { icon: startIcon, draggable: true, title: "Start", zIndexOffset: 1000 }).addTo(map);
      startMarker.on("drag", () => radiusCircle.setLatLng(startMarker.getLatLng()));
      startMarker.on("dragend", () => onStartChange(startMarker.getLatLng()));
    }

    // From the country overview a radius of a few hundred metres is invisible.
    if (map.getZoom() < 13) fit(radiusCircle.getBounds());
    onStartChange(latlng);
  }

  map.on("click", (event) => setStart(event.latlng));
  map.fitBounds(SWISS_BOUNDS, viewPadding());

  return {
    setRadius(metres) {
      radius = metres;
      if (radiusCircle) radiusCircle.setRadius(metres);
    },

    showTour(tour) {
      tourLayer.clearLayers();
      stopMarkers.clear();

      const { geometry, source } = tour.route;
      if (geometry.length > 1) {
        const line = { pane: "route", interactive: false, lineCap: "round", lineJoin: "round" };
        L.polyline(geometry, { ...line, color: "#fff", weight: 8, opacity: 0.9 }).addTo(tourLayer);
        // A dotted line marks the straight-line fallback.
        L.polyline(geometry, { ...line, color: "#000", weight: 4, dashArray: source === "estimate" ? "1 9" : null }).addTo(tourLayer);
      }

      const found = tour.stops.filter((stop) => stop.poi);
      const bounds = L.latLngBounds([[tour.start.lat, tour.start.lon]]);
      found.forEach((stop, index) => {
        const latlng = [stop.poi.lat, stop.poi.lon];
        const marker = L.marker(latlng, { icon: stopIcon(stop), title: `${stop.position}. ${stop.poi.name}`, riseOnHover: true })
          .bindPopup(buildPopup(stop, { fromStart: index === 0 }), {
            maxWidth: 280,
            // Above the bottom sheet there is little room; the popup scrolls instead.
            maxHeight: mobileLayout.matches ? 200 : null,
            autoPanPaddingTopLeft: viewPadding().paddingTopLeft,
            autoPanPaddingBottomRight: viewPadding().paddingBottomRight,
          })
          .addTo(tourLayer);
        stopMarkers.set(stop.position, marker);
        bounds.extend(latlng);
      });
      geometry.forEach((point) => bounds.extend(point));

      if (found.length) fit(bounds);
    },

    openStop(position) {
      const marker = stopMarkers.get(position);
      if (marker) marker.openPopup();
    },

    highlightStop(position) {
      stopMarkers.forEach((marker, key) => {
        $(marker.getElement()).toggleClass("is-active", key === position);
      });
    },

    setHeatmap(points) {
      if (!points) {
        if (heatLayer) map.removeLayer(heatLayer);
        heatLayer = null;
      } else if (heatLayer) {
        heatLayer.setLatLngs(points);
      } else {
        // A high maxZoom keeps single places faint, so only clusters turn dark.
        heatLayer = L.heatLayer(points, { radius: 15, blur: 18, maxZoom: 17, minOpacity: 0.2, gradient: HEAT_GRADIENT }).addTo(map);
      }
    },
  };
}
