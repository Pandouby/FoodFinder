import { AMENITIES } from "./config.js";
import { formatDistance, formatDuration } from "./format.js";

const WHEELCHAIR = {
  yes: "Wheelchair accessible",
  limited: "Partly wheelchair accessible",
  no: "Not wheelchair accessible",
};

function joined(...parts) {
  return parts.filter(Boolean).join(" ");
}

function firstValue(value) {
  return value.split(";")[0].trim();
}

// OSM websites are free text, often without a scheme ("www.example.ch").
function websiteLink(value) {
  let url = firstValue(value);
  if (!/^https?:\/\//i.test(url)) {
    if (!/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(url)) return null;
    url = `https://${url}`;
  }
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return $("<a>", { href: url, target: "_blank", rel: "noopener", text: host });
  } catch {
    return null;
  }
}

function phoneLink(value) {
  const phone = firstValue(value);
  return $("<a>", { href: `tel:${phone.replace(/[^\d+]/g, "")}`, text: phone });
}

// All OSM values go in via text nodes, never as HTML.
export function buildPopup(stop, { fromStart }) {
  const { poi, leg } = stop;
  const details = poi.details;
  const $popup = $("<div>", { class: "popup" });

  $("<p>", { class: "popup__type", text: `Stop ${stop.position}: ${AMENITIES[poi.amenity].label}` }).appendTo($popup);
  $("<h3>", { class: "popup__name", text: poi.name }).appendTo($popup);
  if (leg) {
    const from = fromStart ? "the start" : "the previous stop";
    $("<p>", {
      class: "popup__leg",
      text: `${formatDuration(leg.duration_s)} walk (${formatDistance(leg.distance_m)}) from ${from}`,
    }).appendTo($popup);
  }

  const $list = $("<dl>", { class: "popup__details" });
  const add = (label, content) => {
    if (!content) return;
    $("<dt>", { text: label }).appendTo($list);
    const $value = $("<dd>");
    typeof content === "string" ? $value.text(content) : $value.append(content);
    $value.appendTo($list);
  };

  add("Address", [joined(details.street, details.housenumber), joined(details.postcode, details.city)].filter(Boolean).join(", "));
  add("Cuisine", details.cuisine && details.cuisine.split(";").map((c) => c.trim().replace(/_/g, " ")).join(", "));
  add("Opening hours", details.opening_hours && details.opening_hours.split(";").map((s) => s.trim()).join("\n"));
  add("Phone", details.phone && phoneLink(details.phone));
  add("Website", details.website && websiteLink(details.website));

  const features = [
    details.outdoor_seating === "yes" && "Outdoor seating",
    WHEELCHAIR[details.wheelchair],
  ].filter(Boolean);
  add("Good to know", features.join(", "));

  if ($list.children().length) $list.appendTo($popup);
  return $popup[0];
}
