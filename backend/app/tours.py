"""Plan a tour: random amenities around a start point, in the requested order."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from .repository import AMENITY_TYPES, AmenityRepository, Circle
from .routing import Point, WalkingRouter

MAX_STOPS = 10
MIN_RADIUS_M = 100
MAX_RADIUS_M = 10_000


class ValidationError(ValueError):
    pass


@dataclass(frozen=True)
class TourRequest:
    start: Point
    radius_m: float
    amenities: list[str]

    @classmethod
    def from_json(cls, payload: object) -> TourRequest:
        if not isinstance(payload, dict):
            raise ValidationError("Request body must be a JSON object")

        start = payload.get("start")
        if not isinstance(start, dict):
            raise ValidationError("'start' must be an object with 'lat' and 'lon'")
        lat = _number(start.get("lat"), "start.lat", -90, 90)
        lon = _number(start.get("lon"), "start.lon", -180, 180)
        radius = _number(payload.get("radius_m"), "radius_m", MIN_RADIUS_M, MAX_RADIUS_M)

        amenities = payload.get("amenities")
        if not isinstance(amenities, list) or not 1 <= len(amenities) <= MAX_STOPS:
            raise ValidationError(f"'amenities' must be a list of 1 to {MAX_STOPS} entries")
        unknown = [a for a in amenities if a not in AMENITY_TYPES]
        if unknown:
            raise ValidationError(f"Unknown amenities: {unknown}")

        return cls(Point(lat, lon), radius, amenities)


def _number(value: object, name: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"'{name}' must be a number")
    if not minimum <= value <= maximum:
        raise ValidationError(f"'{name}' must be between {minimum} and {maximum}")
    return float(value)


def plan_tour(
    request: TourRequest, repository: AmenityRepository, router: WalkingRouter
) -> dict:
    area = Circle(request.start.lat, request.start.lon, request.radius_m)

    # One query per amenity type; sampling all stops of a type at once
    # guarantees that the same place is never suggested twice.
    pools = {
        amenity: repository.random_sample(amenity, area, count)
        for amenity, count in Counter(request.amenities).items()
    }
    stops = []
    for position, amenity in enumerate(request.amenities, start=1):
        pool = pools[amenity]
        poi = pool.pop() if pool else None
        stops.append({"position": position, "amenity": amenity, "poi": poi, "leg": None})

    # Stops without a match are skipped; the route connects the ones found.
    found = [stop for stop in stops if stop["poi"]]
    points = [request.start] + [Point(s["poi"]["lat"], s["poi"]["lon"]) for s in found]
    route = router.route(points) if found else None

    legs = route.legs if route else []
    for stop, leg in zip(found, legs):
        # Each leg ends at its stop: start -> stop 1, stop 1 -> stop 2, ...
        stop["leg"] = {"distance_m": round(leg.distance_m), "duration_s": round(leg.duration_s)}

    return {
        "start": {"lat": request.start.lat, "lon": request.start.lon},
        "radius_m": request.radius_m,
        "stops": stops,
        "total": {
            "distance_m": round(sum(leg.distance_m for leg in legs)),
            "duration_s": round(sum(leg.duration_s for leg in legs)),
        },
        "route": {
            "source": route.source if route else None,
            "geometry": route.geometry if route else [],
        },
    }
