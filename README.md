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

# Scope

## Docker Container

### Host DB

### Host Frontend

## MongoDB Database

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

Stop MongoDB with:

```bash
docker compose down
```

Add `-v` to `docker compose down` when the local MongoDB data should also be
removed.

## Flask Frontend

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
