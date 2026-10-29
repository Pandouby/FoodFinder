"""FoodFinder REST backend."""

from __future__ import annotations

import logging
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from werkzeug.exceptions import HTTPException

from .api import bp as api_bp
from .config import load_config
from .repository import AmenityRepository
from .routing import WalkingRouter
from .tours import ValidationError

logger = logging.getLogger(__name__)


def create_app(
    config: dict | None = None,
    *,
    repository: AmenityRepository | None = None,
    router: WalkingRouter | None = None,
) -> Flask:
    """Build the Flask app. Tests pass their own repository and router."""
    app = Flask(__name__, static_folder=None)
    app.config.update(load_config())
    app.config.update(config or {})

    if repository is None:
        client = MongoClient(app.config["MONGO_URI"], serverSelectionTimeoutMS=3000)
        collection = client[app.config["MONGO_DATABASE"]][app.config["MONGO_COLLECTION"]]
        repository = AmenityRepository(collection)
    if router is None:
        router = WalkingRouter(app.config["OSRM_URL"], app.config["OSRM_TIMEOUT"])
    app.extensions["foodfinder"] = {"repository": repository, "router": router}

    app.register_blueprint(api_bp)
    register_error_handlers(app)
    register_frontend(app)
    return app


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ValidationError)
    def validation_error(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(PyMongoError)
    def database_error(error):
        logger.exception("Database error")
        return jsonify(error="Database unavailable"), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/api/"):
            return jsonify(error=error.description), error.code
        return error


def register_frontend(app: Flask) -> None:
    """Serve ../frontend during local development (in Docker nginx does this)."""
    frontend_dir = Path(app.config["FRONTEND_DIR"])
    if not frontend_dir.is_dir():
        return

    @app.get("/")
    def frontend_index():
        return send_from_directory(frontend_dir, "index.html")

    @app.get("/<path:filename>")
    def frontend_file(filename):
        return send_from_directory(frontend_dir, filename)
