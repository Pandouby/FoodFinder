ZURICH_HB = {"lat": 47.3779, "lon": 8.5403}


def tour(client, **overrides):
    payload = {"start": ZURICH_HB, "radius_m": 1000, "amenities": ["cafe", "bar"]}
    payload.update(overrides)
    return client.post("/api/tours", json=payload)


def test_health(client):
    assert client.get("/api/health").get_json() == {"status": "ok"}


def test_amenity_types(client):
    types = client.get("/api/amenities/types").get_json()["types"]
    assert {"amenity": "bar", "count": 3} in types
    assert {"amenity": "restaurant", "count": 0} in types


def test_amenities_filter_by_type(client):
    data = client.get("/api/amenities?amenity=cafe,pub").get_json()
    assert data["count"] == 3
    assert {a["amenity"] for a in data["amenities"]} == {"cafe", "pub"}


def test_amenities_filter_by_area(client):
    data = client.get("/api/amenities?lat=47.3779&lon=8.5403&radius=2000").get_json()
    assert "Pub Bern" not in [a["name"] for a in data["amenities"]]
    assert data["count"] == 5


def test_amenities_rejects_unknown_type(client):
    response = client.get("/api/amenities?amenity=cinema")
    assert response.status_code == 400
    assert "cinema" in response.get_json()["error"]


def test_amenities_requires_complete_area(client):
    assert client.get("/api/amenities?lat=47.3&lon=8.5").status_code == 400


def test_heatmap_returns_coordinates(client):
    points = client.get("/api/amenities/heatmap?amenity=pub").get_json()["points"]
    assert points == [[46.948, 7.4474]]


def test_tour_keeps_requested_order(client):
    data = tour(client, amenities=["bar", "cafe", "bar"]).get_json()
    assert [s["amenity"] for s in data["stops"]] == ["bar", "cafe", "bar"]
    assert [s["position"] for s in data["stops"]] == [1, 2, 3]
    assert [s["poi"]["amenity"] for s in data["stops"]] == ["bar", "cafe", "bar"]


def test_tour_never_repeats_a_place(client):
    data = tour(client, amenities=["bar", "bar", "bar"]).get_json()
    ids = [s["poi"]["id"] for s in data["stops"]]
    assert len(set(ids)) == 3


def test_tour_reports_missing_stops(client):
    data = tour(client, amenities=["cafe", "pub", "bar"]).get_json()
    pub = data["stops"][1]
    assert pub["poi"] is None and pub["leg"] is None
    # The route skips the missing stop: start -> cafe -> bar.
    assert len(data["route"]["geometry"]) == 3
    assert all(s["leg"] for s in data["stops"] if s["poi"])


def test_tour_walking_times(client):
    data = tour(client).get_json()
    legs = [s["leg"] for s in data["stops"]]
    assert all(leg["distance_m"] > 0 and leg["duration_s"] > 0 for leg in legs)
    assert data["total"]["distance_m"] == sum(leg["distance_m"] for leg in legs)
    assert data["route"]["source"] == "estimate"


def test_tour_without_any_match(client):
    data = tour(client, amenities=["restaurant"]).get_json()
    assert data["stops"][0]["poi"] is None
    assert data["total"] == {"distance_m": 0, "duration_s": 0}
    assert data["route"] == {"source": None, "geometry": []}


def test_tour_validation(client):
    assert tour(client, radius_m=10).status_code == 400
    assert tour(client, amenities=[]).status_code == 400
    assert tour(client, amenities=["cinema"]).status_code == 400
    assert tour(client, start={"lat": "47", "lon": 8}).status_code == 400
    assert client.post("/api/tours", data="nope").status_code == 400


def test_unknown_api_route_returns_json(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert "error" in response.get_json()
