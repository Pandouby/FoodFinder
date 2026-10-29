// Relative, so it works behind nginx (Docker) and the Flask dev server alike.
export const API_BASE = "/api";

// Keys match the `amenity` values in MongoDB. Colours are used for markers
// and the stop list, so they need enough contrast for white text.
export const AMENITIES = {
  restaurant: { label: "Restaurant", color: "#C8102E" },
  cafe: { label: "Café", color: "#8B5A2B" },
  bar: { label: "Bar", color: "#5B3FA8" },
  pub: { label: "Pub", color: "#1F7A4D" },
};

export const MAX_STOPS = 10;
export const RADIUS = { min: 100, max: 5000, step: 100, initial: 800 };

export const SWISS_BOUNDS = [[45.818, 5.956], [47.808, 10.492]];

// Standard OSM tiles, turned grey in CSS so markers and the route stand out.
export const TILES = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  maxNativeZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export const HEAT_GRADIENT = { 0.25: "#FFF1A8", 0.5: "#F7C600", 0.75: "#E07A00", 1: "#8A2B00" };
