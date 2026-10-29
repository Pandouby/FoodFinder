"""REST endpoints under /api."""

from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .repository import AMENITY_TYPES, Circle
from .tours import MAX_RADIUS_M, TourRequest, ValidationError, plan_tour

bp = Blueprint("api", __name__, url_prefix="/api")

MAX_LIMIT = 5000


def _repository():
    return current_app.extensions["foodfinder"]["repository"]


def _router():
    return current_app.extensions["foodfinder"]["router"]


def parse_amenities() -> list[str]:
    """Accept ?amenity=cafe&amenity=bar as well as ?amenity=cafe,bar.

    Without the parameter all supported amenity types are returned.
    """
    values = [
        value.strip()
        for raw in request.args.getlist("amenity")
        for value in raw.split(",")
        if value.strip()
    ]
    unknown = [value for value in values if value not in AMENITY_TYPES]
    if unknown:
        raise ValidationError(f"Unknown amenities: {unknown}. Allowed: {list(AMENITY_TYPES)}")
    return values or list(AMENITY_TYPES)


def parse_area() -> Circle | None:
    """Optional circle given by ?lat=..&lon=..&radius=.. (radius in metres)."""
    names = ("lat", "lon", "radius")
    given = [name for name in names if name in request.args]
    if not given:
        return None
    if len(given) != len(names):
        raise ValidationError("'lat', 'lon' and 'radius' must be given together")

    try:
        lat, lon, radius = (float(request.args[name]) for name in names)
    except ValueError as error:
        raise ValidationError("'lat', 'lon' and 'radius' must be numbers") from error
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValidationError("'lat' or 'lon' out of range")
    if not 0 < radius <= MAX_RADIUS_M:
        raise ValidationError(f"'radius' must be between 0 and {MAX_RADIUS_M} metres")
    return Circle(lat, lon, radius)


def parse_limit(default: int = 500) -> int:
    limit = request.args.get("limit", default, type=int)
    if not 1 <= limit <= MAX_LIMIT:
        raise ValidationError(f"'limit' must be between 1 and {MAX_LIMIT}")
    return limit


@bp.get("/health")
def health():
    _repository().ping()
    return jsonify(status="ok")


@bp.get("/amenities/types")
def amenity_types():
    counts = _repository().count_by_type()
    return jsonify(types=[{"amenity": a, "count": c} for a, c in counts.items()])


@bp.get("/amenities")
def amenities():
    results = _repository().find(parse_amenities(), parse_area(), parse_limit())
    return jsonify(count=len(results), amenities=results)


@bp.get("/amenities/heatmap")
def heatmap():
    return jsonify(points=_repository().coordinates(parse_amenities(), parse_area()))


@bp.post("/tours")
def tours():
    tour_request = TourRequest.from_json(request.get_json(silent=True))
    return jsonify(plan_tour(tour_request, _repository(), _router()))
