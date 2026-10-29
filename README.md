# FoodFinder

# Minimum Working Solution

- Select amenities
- Set pin on map
- Get random sugestion
- Get waking time estimat

# Story

- Heatmap for POI
- Selection of Amenities with order
- Search for Amenities
- Present Selection of Amenities
- Calculate walking distance and route

# Jour-Fixes

## Jour-Fix 1

### Done this Sprint
- Setup GitHub Repo
- Docker Container with MongoDB
- Script for loading filtered Amenties in MongoDB

### Goals
- Implement Flask Backend DB connection (Phineas)
- API Call from Frontend to Backend to get DB Data (Silvan)
- Implement LeafletJS frontend to display Heatmap of Ameneties (Valentin)


# Scope

## Project Structure

```
backend/            Flask REST API
  app/
    __init__.py     create_app(): Mongo connection, blueprint, error handlers
    api.py          REST endpoints under /api
    repository.py   MongoDB queries (geo queries, random sampling)
    tours.py        Tour planning and request validation
    routing.py      Walking routes (OSRM) with straight-line fallback
    config.py       Settings from environment variables
  tests/            pytest suite (runs without MongoDB and network)
  wsgi.py           Entry point for gunicorn
  Dockerfile
frontend/           Single-page app: HTML, CSS, jQuery, LeafletJS
  index.html
  css/style.css
  js/               main, map, widget (settings panel), popup, api, config, format
  nginx.conf        Serves the files and forwards /api to the backend
  Dockerfile
scripts/            Data import
data/               OSM export
```

## Docker Container

Run the whole application (MongoDB, backend, frontend) with Docker Compose:

```bash
docker compose up -d --build
docker compose run --rm importer   # first time only: fill the MongoDB container
```

Then open <http://localhost:8080>. nginx serves the frontend and forwards
`/api` to the backend, so the API is also reachable at
<http://localhost:8080/api>. The backend port itself is not published, because
macOS uses port 5000 for AirPlay.

### Host DB

The `mongodb` service stores its data in the `mongodb-data` volume.

### Host Frontend

The `frontend` service is an nginx container built from `frontend/`. After
changing frontend files, rebuild it with `docker compose up -d --build frontend`.

## MongoDB Database

Connect to db using

``` bash
mongosh "mongodb://localhost:27017"
```

> If MongoDB is also installed via Homebrew and running, it listens on
> `127.0.0.1:27017` and hides the Docker container. Stop it with
> `brew services stop mongodb-community` or use the `importer` service above.

### Only ameneties we are interested in

Start a local MongoDB instance with Docker Compose:

```bash
docker compose up -d mongodb
```

Once MongoDB is healthy, import only restaurants, bars, pubs, and cafes from the
OSM export:

```bash
uv run python scripts/import_amenities.py
```

The importer reads `data/osm-output.json` by default and writes to the
`foodfinder.amenities` collection. It is safe to run repeatedly because records
are upserted by their OSM `id`.

Besides the original OSM fields (where `lat` and `lon` are strings), every
document gets a GeoJSON field `location: {type: "Point", coordinates: [lon, lat]}`
with a `2dsphere` index. The backend's geo queries need it, so **run the
importer again** if your database was filled with an older version of the
script.

Stop MongoDB with:

```bash
docker compose down
```

Add `-v` to `docker compose down` when the local MongoDB data should also be
removed.

## Flask Backend

Start the backend for local development (MongoDB must be running):

```bash
cd backend
uv run flask --app app run --debug --port 5001
```

During development Flask also serves the `frontend/` folder, so the whole app
runs at <http://localhost:5001>.

Configuration via environment variables:

| Variable           | Default                                       |
|--------------------|-----------------------------------------------|
| `MONGO_URI`        | `mongodb://localhost:27017`                   |
| `MONGO_DATABASE`   | `foodfinder`                                  |
| `MONGO_COLLECTION` | `amenities`                                   |
| `OSRM_URL`         | `https://routing.openstreetmap.de/routed-foot` (empty = always estimate) |
| `OSRM_TIMEOUT`     | `5` (seconds)                                 |

### REST Endpoints

| Method | Path                     | Description |
|--------|--------------------------|-------------|
| GET    | `/api/health`            | Checks the database connection. |
| GET    | `/api/amenities/types`   | Supported amenity types with their counts. |
| GET    | `/api/amenities`         | Amenities filtered by `amenity` (repeat or comma separated, e.g. `cafe,bar`) and optionally by area: `lat`, `lon`, `radius` (metres). `limit` defaults to 500. |
| GET    | `/api/amenities/heatmap` | Only `[lat, lon]` pairs, same filters as above. |
| POST   | `/api/tours`             | Random tour, see below. |

Example tour request:

```bash
curl -X POST http://localhost:5001/api/tours \
  -H "Content-Type: application/json" \
  -d '{"start": {"lat": 47.3779, "lon": 8.5403}, "radius_m": 800, "amenities": ["cafe", "restaurant", "bar"]}'
```

For every requested stop the backend picks a random, named place of that type
inside the radius (`$geoWithin` + `$sample`), keeping the requested order and
never suggesting the same place twice. Stops without a match come back with
`"poi": null`. Walking distance and time between consecutive stops come from
the public FOSSGIS OSRM server (foot profile). If it does not answer, the
backend falls back to the straight-line distance × 1.3 at 5 km/h and sets
`route.source` to `"estimate"`.

Run the tests with:

```bash
uv run pytest
```

## Frontend

Plain HTML, CSS and jQuery without a framework or build step. Libraries come
from CDNs: jQuery, jQuery UI (Sortable, plus Touch Punch for touch devices),
LeafletJS and Leaflet.heat.

1. Add stops with the dropdown and drag them into the order you want to visit
   them (keyboard: Alt + arrow keys).
2. Click on the map to set the start pin, then set the search radius.
3. "Find a tour" shows the stops as numbered pins with the walking route, and
   in the panel as a signpost with the walking time for each leg.
4. "Try other places" draws a new random selection. The heatmap checkbox shows
   where the selected types of places are.

### LeafletJS

- Map of POI
- Heatmap

### ChartJS

## Python Environment

This project uses [uv](https://docs.astral.sh/uv/) to manage Python dependencies and
the virtual environment. The project requires Python 3.14 or newer.

Create or update the environment with:

```bash
uv sync
```

Activate the environment when you want to run commands manually:

```bash
source .venv/bin/activate
```

To add another Python dependency, use:

```bash
uv add <package-name>
```

Then commit the updated `pyproject.toml` and `uv.lock` files.
