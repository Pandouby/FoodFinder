import { API_BASE } from "./config.js";

function request(path, options = {}) {
  return $.ajax({ url: API_BASE + path, dataType: "json", timeout: 15000, ...options });
}

export const api = {
  heatmap: (amenities) => request("/amenities/heatmap", { data: { amenity: amenities.join(",") } }),

  counts: ({ start, radius }) => request("/amenities/types", { data: { lat: start.lat, lon: start.lng, radius } }),

  tour: ({ start, radius, stops }) =>
    request("/tours", {
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        start: { lat: start.lat, lon: start.lng },
        radius_m: radius,
        amenities: stops,
      }),
    }),
};

export function errorMessage(xhr) {
  if (xhr.status === 0) {
    return "Can't reach the FoodFinder server. Check that the backend is running.";
  }
  if (xhr.status === 503) {
    return "The database isn't available. Check that MongoDB is running.";
  }
  if (xhr.responseJSON && xhr.responseJSON.error) {
    return xhr.responseJSON.error;
  }
  return `The server answered with an error (HTTP ${xhr.status}). Try again.`;
}
