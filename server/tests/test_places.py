import logging
import socket
import threading
import time

import httpx
import pytest
import uvicorn
from shinigami.main import create_app
from shinigami.places import load_places

HOME = (-37.7234, 145.0912)  # test-only fake coordinates (off the 0.1 degree cell centre)

TOML = f"""
[[place]]
id = "home"
label = "Home (Bulleen)"
lat = {HOME[0]}
lon = {HOME[1]}

[[place]]
id = "monash"
label = "Monash Clayton"
lat = -37.9105
lon = 145.1340

[[place]]
id = "cbd"
label = "Melbourne CBD"
lat = -37.8136
lon = 144.9631

[[place]]
id = "gym"
label = "Hammers Gym Nunawading"
lat = -37.8206
lon = 145.1745
"""


@pytest.fixture
def pclient(settings):
    settings.places_path.write_text(TOML)
    app = create_app(settings, start_runtime=False)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def test_load_places_order(tmp_path):
    f = tmp_path / "p.toml"
    f.write_text(TOML)
    ps = load_places(f)
    assert [p.id for p in ps] == ["home", "monash", "cbd", "gym"]
    assert ps[1].label == "Monash Clayton"


def test_load_places_skips_invalid_without_coordinates_in_log(tmp_path, caplog):
    f = tmp_path / "p.toml"
    f.write_text(
        '[[place]]\nid = "nolat"\nlabel = "X"\n\n'
        '[[place]]\nid = "bad"\nlabel = "Y"\nlat = 123.456\nlon = 10.0\n\n'
        '[[place]]\nid = "ok"\nlabel = "Z"\nlat = 1.5\nlon = 2.5\n'
    )
    with caplog.at_level(logging.DEBUG):
        ps = load_places(f)
    assert [p.id for p in ps] == ["ok"]
    text = caplog.text
    assert "nolat" in text and "bad" in text
    assert "123.456" not in text


def test_load_places_missing_file(tmp_path, caplog):
    with caplog.at_level(logging.WARNING):
        assert load_places(tmp_path / "nope.toml") == []
    assert len([r for r in caplog.records if r.name == "shinigami.places"]) == 1


async def test_api_places_no_coordinates(pclient):
    r = await pclient.get("/api/places")
    assert r.status_code == 200
    body = r.json()
    assert [p["id"] for p in body] == ["home", "monash", "cbd", "gym"]
    assert all(set(p) == {"id", "label"} for p in body)
    assert str(HOME[0]) not in r.text and "lat" not in r.text


async def test_places_empty_when_no_file(client):
    assert (await client.get("/api/places")).json() == []


async def test_profile_place_pin(pclient):
    r = await pclient.get("/api/profile", params={"place": "monash"})
    assert r.status_code == 200
    loc = r.json()["location"]
    assert loc["source"] == "pin" and loc["place_id"] == "monash"
    assert loc["label"] == "Monash Clayton"
    assert loc["lat"] is None and loc["lon"] is None
    d = await pclient.get("/api/profile", params={"place": "cbd"})
    sun_m = {i["id"]: i["target_ts"] for i in r.json()["layers"]["sun"]["items"]}
    sun_c = {i["id"]: i["target_ts"] for i in d.json()["layers"]["sun"]["items"]}
    assert sun_m != sun_c  # computed at different coordinates


async def test_home_pin_never_leaks_coordinates(pclient):
    r = await pclient.get("/api/profile", params={"place": "home"})
    assert str(HOME[0]) not in r.text and str(HOME[1]) not in r.text


@pytest.mark.parametrize(
    "params",
    [
        {"place": "nope"},
        {"place": "home", "lat": 1, "lon": 1},
        {"place": "Bad!"},
        {"lat": -37.8, "lon": 144.9, "src": "search", "label": "x" * 121},
    ],
)
async def test_profile_place_validation(pclient, params):
    assert (await pclient.get("/api/profile", params=params)).status_code == 422


async def test_gps_label_near_and_far(pclient):
    near = await pclient.get("/api/profile", params={"lat": HOME[0] + 0.003, "lon": HOME[1]})
    assert near.json()["location"]["source"] == "gps"
    assert near.json()["location"]["label"] == "near Home (Bulleen)"
    far = await pclient.get("/api/profile", params={"lat": -33.9, "lon": 151.2})
    assert far.json()["location"]["label"] == "current location"


async def test_search_label(pclient):
    r = await pclient.get(
        "/api/profile",
        params={"lat": -37.8, "lon": 144.99, "src": "search", "label": "Smith St Collingwood"},
    )
    loc = r.json()["location"]
    assert loc["source"] == "search" and loc["label"] == "Smith St Collingwood"
    r = await pclient.get("/api/profile", params={"lat": -37.8, "lon": 144.99, "src": "search"})
    assert r.json()["location"]["label"] == "searched place"


def test_stream_accepts_place(settings):
    settings.places_path.write_text(TOML)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(
            create_app(settings, start_runtime=False),
            host="127.0.0.1",
            port=port,
            access_log=False,
            log_level="warning",
            timeout_graceful_shutdown=5,
        )
    )
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    try:
        for _ in range(100):
            if server.started:
                break
            time.sleep(0.05)
        t0 = time.time()
        first = None
        with httpx.stream(
            "GET", f"http://127.0.0.1:{port}/api/stream?place=monash", timeout=5
        ) as r:
            assert r.status_code == 200
            for line in r.iter_lines():
                if line.startswith("event:"):
                    first = line.split(":", 1)[1].strip()
                    break
        assert first == "hello" and time.time() - t0 < 2
        assert httpx.get(f"http://127.0.0.1:{port}/api/stream?place=nope").status_code == 422
    finally:
        server.should_exit = True
        t.join(10)


async def test_place_pin_has_no_camera_layers(settings):
    import json as _json

    from shinigami.geo import snap_cell

    # camera right next to the CBD place; must never be reflected for the pin
    settings.cameras_path.write_text(
        _json.dumps(
            {
                "version": 1,
                "built_at": 1.0,
                "source": "t",
                "cameras": [{"id": "c1", "k": "cctv", "lat": -37.8137, "lon": 144.9631}],
            }
        )
    )
    settings.places_path.write_text(TOML)
    app = create_app(settings, start_runtime=False)
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    r = await c.get("/api/profile", params={"place": "cbd"})
    body = r.json()
    assert not [k for k in body["layers"] if k.startswith("cameras_")]
    assert "distance_m" not in r.text
    loc = body["location"]
    cell = snap_cell(-37.8136, 144.9631)
    assert loc["lat"] is None and loc["lon"] is None
    assert (loc["cell_lat"], loc["cell_lon"]) == (cell.lat, cell.lon)
    # same assemble path as the stream hello
    from shinigami.api.profile import resolve_location
    from shinigami.assemble import assemble_profile

    class Req:
        pass

    req = Req()
    req.app = app
    location, la, lo = resolve_location(req, None, None, "cbd")
    prof = assemble_profile(app.state.ctx, app.state.providers, location, la, lo)
    assert not [k for k in prof.layers if k.startswith("cameras_")]
    g = await c.get("/api/profile", params={"lat": -37.8136, "lon": 144.9631})
    assert "cameras_cctv" in g.json()["layers"]
