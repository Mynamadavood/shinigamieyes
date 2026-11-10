import logging
import socket
import threading
import time

import httpx
import pytest
import uvicorn
from shinigami.geo import snap_cell
from shinigami.main import create_app
from shinigami.places import load_places
from shinigami.providers.sun import sun_boundaries

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
    assert all(set(p) == {"id", "label", "cameras"} for p in body)
    assert {p["id"]: p["cameras"] for p in body} == {
        "home": False,
        "monash": True,
        "cbd": True,
        "gym": True,
    }
    assert str(HOME[0]) not in r.text and "lat" not in r.text


async def test_places_empty_when_no_file(client):
    assert (await client.get("/api/places")).json() == []


async def test_profile_place_pin(pclient):
    before = time.time()
    r = await pclient.get("/api/profile", params={"place": "monash"})
    assert r.status_code == 200
    loc = r.json()["location"]
    assert loc["source"] == "pin" and loc["place_id"] == "monash"
    assert loc["label"] == "Monash Clayton"
    assert loc["lat"] is None and loc["lon"] is None
    # Sun times are computed for Monash's own cell. (Comparing against the CBD was flaky:
    # the cells are 0.1 deg apart, under 30 s of solar time, so whole-minute times often match.)
    cell = snap_cell(-37.9105, 145.1340)
    assert cell != snap_cell(-37.8136, 144.9631)
    sun_m = {i["id"]: i["target_ts"] for i in r.json()["layers"]["sun"]["items"]}
    expected = {i.id: i.target_ts for i in sun_boundaries(cell.lat, cell.lon, before)}
    assert sun_m and all(expected.get(k) == v for k, v in sun_m.items())


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


def _cam_settings(settings):
    import json as _json

    # camera right next to the CBD place and right next to the fake home
    settings.cameras_path.write_text(
        _json.dumps(
            {
                "version": 1,
                "built_at": 1.0,
                "source": "t",
                "cameras": [
                    {"id": "c1", "k": "cctv", "lat": -37.8137, "lon": 144.9631},
                    {"id": "c2", "k": "cctv", "lat": HOME[0] + 0.0001, "lon": HOME[1]},
                ],
            }
        )
    )
    settings.places_path.write_text(TOML)
    return create_app(settings, start_runtime=False)


async def test_place_pin_with_cameras_shows_layers(settings):
    app = _cam_settings(settings)
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    r = await c.get("/api/profile", params={"place": "cbd"})
    body = r.json()
    assert "cameras_cctv" in body["layers"] and "cameras_road" in body["layers"]
    items = body["layers"]["cameras_cctv"]["items"]
    assert any("distance_m" in (i.get("detail") or {}) for i in items)
    loc = body["location"]
    cell = snap_cell(-37.8136, 144.9631)
    assert loc["lat"] is None and loc["lon"] is None
    assert (loc["cell_lat"], loc["cell_lon"]) == (cell.lat, cell.lon)
    g = await c.get("/api/profile", params={"lat": -37.8136, "lon": 144.9631})
    assert "cameras_cctv" in g.json()["layers"]


async def test_home_pin_has_no_camera_layers(settings):
    app = _cam_settings(settings)
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    r = await c.get("/api/profile", params={"place": "home"})
    assert not [k for k in r.json()["layers"] if k.startswith("cameras_")]
    assert "distance_m" not in r.text
    assert str(HOME[0]) not in r.text and str(HOME[1]) not in r.text


async def test_assemble_pin_fails_closed_and_stream_gate(settings):
    from shinigami.api.profile import camera_ok, resolve_location
    from shinigami.assemble import assemble_profile

    app = _cam_settings(settings)

    class Req:
        pass

    req = Req()
    req.app = app
    for pid, expect in (("home", False), ("cbd", True)):
        location, la, lo = resolve_location(req, None, None, pid)
        assert camera_ok(req, location) is expect
        default = assemble_profile(app.state.ctx, app.state.providers, location, la, lo)
        assert not [k for k in default.layers if k.startswith("cameras_")]
        prof = assemble_profile(
            app.state.ctx, app.state.providers, location, la, lo, exact_ok=camera_ok(req, location)
        )
        assert bool([k for k in prof.layers if k.startswith("cameras_")]) is expect


def test_load_places_cameras_flag_rules(tmp_path, caplog):
    f = tmp_path / "p.toml"
    f.write_text(
        '[[place]]\nid = "a"\nlabel = "A"\nlat = 1.5\nlon = 2.5\n\n'
        '[[place]]\nid = "b"\nlabel = "B"\nlat = 1.5\nlon = 2.5\ncameras = false\n\n'
        '[[place]]\nid = "c"\nlabel = "C"\nlat = 1.5\nlon = 2.5\ncameras = "yes"\n\n'
        '[[place]]\nid = "home"\nlabel = "H"\nlat = 7.7777\nlon = 8.8888\ncameras = true\n\n'
        '[[place]]\nid = "office"\nlabel = "Home office"\nlat = 1.5\nlon = 2.5\n'
    )
    with caplog.at_level(logging.DEBUG):
        ps = load_places(f)
    assert {p.id: p.cameras for p in ps} == {
        "a": True,
        "b": False,
        "c": False,
        "home": False,
        "office": False,
    }
    assert "home" in caplog.text
    assert "7.7777" not in caplog.text and "8.8888" not in caplog.text
