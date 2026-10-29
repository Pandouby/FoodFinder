"""MongoDB access for the amenities collection."""

from __future__ import annotations

from dataclasses import dataclass

from pymongo.collection import Collection

AMENITY_TYPES = ("restaurant", "cafe", "bar", "pub")

# $centerSphere expects its radius in radians.
EARTH_RADIUS_M = 6_378_100

# OSM tags that are passed on to the frontend for the marker popup.
DETAIL_FIELDS = (
    "cuisine",
    "opening_hours",
    "street",
    "housenumber",
    "postcode",
    "city",
    "website",
    "phone",
    "outdoor_seating",
    "wheelchair",
)
FALLBACK_FIELDS = {"website": "contact:website", "phone": "contact:phone"}


@dataclass(frozen=True)
class Circle:
    lat: float
    lon: float
    radius_m: float

    def to_query(self) -> dict:
        return {
            "$geoWithin": {
                "$centerSphere": [[self.lon, self.lat], self.radius_m / EARTH_RADIUS_M]
            }
        }


def to_poi(doc: dict) -> dict:
    """Convert a MongoDB document into the shape returned by the API."""
    lon, lat = doc["location"]["coordinates"]
    details = {}
    for field in DETAIL_FIELDS:
        value = doc.get(field) or doc.get(FALLBACK_FIELDS.get(field, ""))
        if value:
            details[field] = value
    return {
        "id": doc["id"],
        "name": doc.get("name"),
        "amenity": doc["amenity"],
        "lat": lat,
        "lon": lon,
        "details": details,
    }


class AmenityRepository:
    def __init__(self, collection: Collection):
        self._collection = collection

    def ping(self) -> None:
        self._collection.database.command("ping")

    def count_by_type(self) -> dict[str, int]:
        pipeline = [
            {"$match": {"amenity": {"$in": list(AMENITY_TYPES)}}},
            {"$group": {"_id": "$amenity", "count": {"$sum": 1}}},
        ]
        counts = {row["_id"]: row["count"] for row in self._collection.aggregate(pipeline)}
        return {amenity: counts.get(amenity, 0) for amenity in AMENITY_TYPES}

    def find(
        self, amenities: list[str], area: Circle | None = None, limit: int = 500
    ) -> list[dict]:
        cursor = self._collection.find(
            self._filter(amenities, area), {"_id": 0}
        ).limit(limit)
        return [to_poi(doc) for doc in cursor]

    def coordinates(self, amenities: list[str], area: Circle | None = None) -> list[list[float]]:
        """Return only [lat, lon] pairs, which keeps the heatmap payload small."""
        cursor = self._collection.find(
            self._filter(amenities, area), {"_id": 0, "location.coordinates": 1}
        )
        return [[lat, lon] for lon, lat in (doc["location"]["coordinates"] for doc in cursor)]

    def random_sample(self, amenity: str, area: Circle, size: int) -> list[dict]:
        """Pick up to `size` distinct, named amenities of one type inside `area`."""
        query = self._filter([amenity], area)
        query["name"] = {"$nin": [None, ""]}
        pipeline = [
            {"$match": query},
            {"$sample": {"size": size}},
            {"$project": {"_id": 0}},
        ]
        return [to_poi(doc) for doc in self._collection.aggregate(pipeline)]

    @staticmethod
    def _filter(amenities: list[str], area: Circle | None) -> dict:
        query: dict = {
            "amenity": {"$in": amenities},
            "location": area.to_query() if area else {"$exists": True},
        }
        return query
