"""Configuration read from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


def load_config() -> dict:
    return {
        "MONGO_URI": os.environ.get("MONGO_URI", "mongodb://localhost:27017"),
        "MONGO_DATABASE": os.environ.get("MONGO_DATABASE", "foodfinder"),
        "MONGO_COLLECTION": os.environ.get("MONGO_COLLECTION", "amenities"),
        # Public FOSSGIS OSRM instance with a foot profile. Set to an empty
        # string to always use the straight-line estimate instead.
        "OSRM_URL": os.environ.get(
            "OSRM_URL", "https://routing.openstreetmap.de/routed-foot"
        ),
        "OSRM_TIMEOUT": float(os.environ.get("OSRM_TIMEOUT", "5")),
        # During local development Flask also serves the static frontend so
        # that frontend and API share one origin. In Docker nginx does this.
        "FRONTEND_DIR": os.environ.get("FRONTEND_DIR", str(DEFAULT_FRONTEND_DIR)),
    }
