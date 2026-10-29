import io
import json
import urllib.error

import pytest

from app.routing import (
    DETOUR_FACTOR,
    WALKING_SPEED_MPS,
    Point,
    WalkingRouter,
    estimate_route,
    haversine_m,
)

ZURICH_HB = Point(47.3779, 8.5403)
BERN_HB = Point(46.9490, 7.4391)


def test_haversine_zurich_bern():
    assert haversine_m(ZURICH_HB, BERN_HB) == pytest.approx(95_500, rel=0.01)


def test_estimate_route_uses_detour_and_walking_speed():
    route = estimate_route([ZURICH_HB, BERN_HB])
    leg = route.legs[0]
    assert leg.distance_m == pytest.approx(haversine_m(ZURICH_HB, BERN_HB) * DETOUR_FACTOR)
    assert leg.duration_s == pytest.approx(leg.distance_m / WALKING_SPEED_MPS)
    assert route.source == "estimate"


def fake_urlopen(payload):
    def urlopen(request, timeout):
        return io.BytesIO(json.dumps(payload).encode())

    return urlopen


def test_osrm_response_is_parsed(monkeypatch):
    payload = {
        "code": "Ok",
        "routes": [
            {
                "legs": [{"distance": 900.0, "duration": 700.0}],
                "geometry": {"coordinates": [[8.54, 47.37], [8.55, 47.38]]},
            }
        ],
    }
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen(payload))

    route = WalkingRouter("https://osrm.test").route([ZURICH_HB, BERN_HB])
    assert route.source == "osrm"
    assert route.legs[0].duration_s == 700.0
    # OSRM sends [lon, lat]; Leaflet wants [lat, lon].
    assert route.geometry == [[47.37, 8.54], [47.38, 8.55]]


@pytest.mark.parametrize(
    "urlopen",
    [
        fake_urlopen({"code": "NoRoute", "message": "Impossible route"}),
        fake_urlopen({"code": "Ok", "routes": []}),
    ],
)
def test_falls_back_on_osrm_error_response(monkeypatch, urlopen):
    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    assert WalkingRouter("https://osrm.test").route([ZURICH_HB, BERN_HB]).source == "estimate"


def test_falls_back_when_osrm_unreachable(monkeypatch):
    def unreachable(request, timeout):
        raise urllib.error.URLError("offline")

    monkeypatch.setattr("urllib.request.urlopen", unreachable)
    assert WalkingRouter("https://osrm.test").route([ZURICH_HB, BERN_HB]).source == "estimate"
