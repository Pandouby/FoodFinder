#!/usr/bin/env python3
"""Import selected amenities from the OSM export into MongoDB."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from pymongo import MongoClient, UpdateOne

ALLOWED_AMENITIES = {"restaurant", "bar", "pub", "cafe"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/osm-output.json"),
        help="Path to the OSM JSON export.",
    )
    parser.add_argument(
        "--uri",
        default="mongodb://localhost:27017",
        help="MongoDB connection URI.",
    )
    parser.add_argument("--database", default="foodfinder")
    parser.add_argument("--collection", default="amenities")
    return parser.parse_args()


def load_amenities(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as source:
        payload = json.load(source)

    nodes = payload.get("nodes")
    if not isinstance(nodes, list):
        raise ValueError("Expected the input JSON to contain a 'nodes' list")

    return [
        node
        for node in nodes
        if isinstance(node, dict)
        and node.get("amenity") in ALLOWED_AMENITIES
        and node.get("id")
    ]


def main() -> None:
    args = parse_args()
    amenities = load_amenities(args.input)

    with MongoClient(args.uri) as client:
        collection = client[args.database][args.collection]
        collection.create_index("id", unique=True)
        collection.create_index("amenity")

        operations = [
            UpdateOne({"id": amenity["id"]}, {"$set": amenity}, upsert=True)
            for amenity in amenities
        ]
        if operations:
            result = collection.bulk_write(operations, ordered=False)
        else:
            result = None

    modified = result.modified_count if result else 0
    upserted = result.upserted_count if result else 0
    print(
        f"Loaded {len(amenities)} amenities "
        f"({upserted} inserted, {modified} updated) into "
        f"{args.database}.{args.collection}."
    )


if __name__ == "__main__":
    main()
