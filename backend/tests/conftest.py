from __future__ import annotations

import pytest

from app import create_app
from app.repository import AMENITY_TYPES, Circle
from app.routing import Point, WalkingRouter, haversine_m

# A few places around Zürich HB (47.3779, 8.5403).
POIS = [
    {"id": "1", "name": "Café Eins", "amenity": "cafe", "lat": 47.3785, "lon": 8.5410, "details": {}},
    {"id": "2", "name": "Café Zwei", "amenity": "cafe", "lat": 47.3770, "lon": 8.5390, "details": {}},
    {"id": "3", "name": "Bar Drei", "amenity": "bar", "lat": 47.3760, "lon": 8.5420, "details": {}},
    {"id": "4", "name": "Bar Vier", "amenity": "bar", "lat": 47.3790, "lon": 8.5380, "details": {}},
    {"id": "5", "name": "Bar Fünf", "amenity": "bar", "lat": 47.3800, "lon": 8.5430, "details": {}},
    {"id": "6", "name": "Pub Bern", "amenity": "pub", "lat": 46.9480, "lon": 7.4474, "details": {}},
]


class FakeRepository:
    """In-memory stand-in for AmenityRepository."""

    def __init__(self, pois=POIS):
        self.pois = pois

    def ping(self):
        pass

    def count_by_type(self):
        return {a: sum(p["amenity"] == a for p in self.pois) for a in AMENITY_TYPES}

    def _matching(self, amenities, area: Circle | None):
        for poi in self.pois:
            if poi["amenity"] not in amenities:
                continue
            if area and haversine_m(Point(area.lat, area.lon), Point(poi["lat"], poi["lon"])) > area.radius_m:
                continue
            yield poi

    def find(self, amenities, area=None, limit=500):
        return list(self._matching(amenities, area))[:limit]

    def coordinates(self, amenities, area=None):
        return [[p["lat"], p["lon"]] for p in self._matching(amenities, area)]

    def random_sample(self, amenity, area, size):
        return [dict(p) for p in self._matching([amenity], area)][:size]


@pytest.fixture
def app():
    return create_app(
        {"TESTING": True, "FRONTEND_DIR": "/nonexistent"},
        repository=FakeRepository(),
        router=WalkingRouter(osrm_url=None),
    )


@pytest.fixture
def client(app):
    return app.test_client()
