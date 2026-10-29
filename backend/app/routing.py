"""Walking routes: OSRM foot routing with a straight-line estimate as fallback."""

from __future__ import annotations

import json
import logging
import math
import urllib.request
from dataclasses import dataclass
from itertools import pairwise

logger = logging.getLogger(__name__)

EARTH_RADIUS_M = 6_371_000
WALKING_SPEED_MPS = 5 / 3.6
# Streets are rarely straight, so the straight-line distance is stretched.
DETOUR_FACTOR = 1.3
USER_AGENT = "FoodFinder/0.1 (ZHAW PM3 student project)"


@dataclass(frozen=True)
class Point:
    lat: float
    lon: float


@dataclass(frozen=True)
class Leg:
    distance_m: float
    duration_s: float


@dataclass(frozen=True)
class Route:
    legs: list[Leg]
    # [[lat, lon], ...] so the frontend can pass it straight to Leaflet.
    geometry: list[list[float]]
    source: str  # "osrm" or "estimate"


class RoutingError(Exception):
    pass


def haversine_m(a: Point, b: Point) -> float:
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = lat2 - lat1
    dlon = math.radians(b.lon - a.lon)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def estimate_route(points: list[Point]) -> Route:
    legs = []
    for a, b in pairwise(points):
        distance = haversine_m(a, b) * DETOUR_FACTOR
        legs.append(Leg(distance, distance / WALKING_SPEED_MPS))
    return Route(legs, [[p.lat, p.lon] for p in points], "estimate")


class WalkingRouter:
    def __init__(self, osrm_url: str | None, timeout: float = 5):
        self._osrm_url = osrm_url.rstrip("/") if osrm_url else None
        self._timeout = timeout

    def route(self, points: list[Point]) -> Route:
        if self._osrm_url:
            try:
                return self._osrm_route(points)
            except RoutingError as error:
                logger.warning("OSRM routing failed, using estimate: %s", error)
        return estimate_route(points)

    def _osrm_route(self, points: list[Point]) -> Route:
        coordinates = ";".join(f"{p.lon:.6f},{p.lat:.6f}" for p in points)
        url = (
            f"{self._osrm_url}/route/v1/foot/{coordinates}"
            "?overview=full&geometries=geojson"
        )
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                payload = json.load(response)
            if payload.get("code") != "Ok":
                raise RoutingError(payload.get("message", payload.get("code")))

            route = payload["routes"][0]
            legs = [Leg(leg["distance"], leg["duration"]) for leg in route["legs"]]
            geometry = [[lat, lon] for lon, lat in route["geometry"]["coordinates"]]
        except (OSError, ValueError, KeyError, IndexError, TypeError) as error:
            raise RoutingError(str(error)) from error

        return Route(legs, geometry, "osrm")
