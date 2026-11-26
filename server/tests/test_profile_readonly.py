import socket
import time

import httpx
import pytest
from pydantic import SecretStr


def _boom(*a, **k):
    raise AssertionError("outbound network call attempted")


async def test_profile_with_coords(client):
    r = await client.get("/api/profile", params={"lat": -37.8136, "lon": 144.9631})
    assert r.status_code == 200
    p = r.json()
    assert abs(p["server_time"] - time.time()) < 5
    assert p["location"]["source"] == "gps"
    sun = p["layers"]["sun"]
    assert sun["status"] == "fresh"
    assert len([i for i in sun["items"] if i["target_ts"] > p["server_time"]]) >= 2


async def test_profile_default(client, settings):
    r = await client.get("/api/profile")
    loc = r.json()["location"]
    assert loc["source"] == "default"
    assert loc["label"] == "Melbourne CBD"
    assert (loc["lat"], loc["lon"]) == (settings.default_lat, settings.default_lon)


@pytest.mark.parametrize(
    "params", [{"lat": -37.8}, {"lon": 144.9}, {"lat": 91, "lon": 0}, {"lat": 0, "lon": -181}]
)
async def test_profile_validation(client, params):
    r = await client.get("/api/profile", params=params)
    assert r.status_code == 422


async def test_no_outbound_and_latency(client, monkeypatch):
    durations = []
    with monkeypatch.context() as m:
        # the test client itself is an AsyncClient on an in-process ASGI transport,
        # so block only the real network transports
        m.setattr(httpx.AsyncHTTPTransport, "handle_async_request", _boom)
        m.setattr(httpx.HTTPTransport, "handle_request", _boom)
        m.setattr(socket.socket, "connect", _boom)
        for _ in range(200):
            t0 = time.perf_counter()
            r = await client.get("/api/profile", params={"lat": -37.8136, "lon": 144.9631})
            durations.append(time.perf_counter() - t0)
            assert r.status_code == 200
    durations.sort()
    p95 = durations[int(len(durations) * 0.95) - 1]
    assert p95 <= 0.050, f"p95 {p95 * 1000:.1f} ms"


async def test_cold_cell_pending_and_requests_fetch(client, fake_runtime, monkeypatch):
    from shinigami.geo import snap_cell

    durations = []
    with monkeypatch.context() as m:
        m.setattr(httpx.AsyncHTTPTransport, "handle_async_request", _boom)
        m.setattr(httpx.HTTPTransport, "handle_request", _boom)
        m.setattr(socket.socket, "connect", _boom)
        for _ in range(100):
            t0 = time.perf_counter()
            r = await client.get("/api/profile", params={"lat": -37.8136, "lon": 144.9631})
            durations.append(time.perf_counter() - t0)
            assert r.status_code == 200
    layers = r.json()["layers"]
    assert layers["sun"]["status"] == "fresh"
    assert layers["uv_now"]["status"] == "pending"
    assert layers["uv_window"]["status"] == "pending"
    assert ("uv_window", snap_cell(-37.8136, 144.9631)) in fake_runtime.requests
    assert layers["weather"]["status"] == "pending"
    assert layers["fire_danger"]["status"] == "pending"
    assert layers["pollen"]["status"] == "pending"
    # only the per-cell (on_demand) providers ask for a fetch
    assert {pid for pid, _ in fake_runtime.requests} == {"uv_window", "weather"}
    durations.sort()
    assert durations[int(len(durations) * 0.95) - 1] <= 0.050


def _transit_world(settings, transit_store_file, devid="1000001"):
    import respx  # noqa: F401
    from shinigami.main import create_app

    pt = (-37.0, 144.0)
    home = (-10.5321, 120.5432)
    transit_store_file(
        [
            {"id": 2720, "mode": "tram", "name": "S", "poles": [[pt[0] + 0.0003, pt[1], ["96:0"]]],
             "gtfs_ids": [], "routes": ["96"]},
            {"id": 7, "mode": "tram", "name": "H", "poles": [[home[0] + 0.0003, home[1], ["5:0"]]],
             "gtfs_ids": [], "routes": ["5"]},
        ]
    )  # fmt: skip
    settings.places_path.write_text(
        '[[place]]\nid = "home"\nlabel = "Home"\nis_home = true\n'
        f"lat = {home[0]}\nlon = {home[1]}\n\n"
        f'[[place]]\nid = "pub"\nlabel = "Pub"\nlat = {pt[0]}\nlon = {pt[1]}\n'
    )
    s = settings.model_copy(
        update={
            "ptv_devid": SecretStr(devid),
            "ptv_key": SecretStr("0" * 8 + "-0000-0000-0000-" + "0" * 12),
        }
    )
    app = create_app(s, start_runtime=False)
    rt = type("RT", (), {"nudges": [], "nudge": lambda self, p: self.nudges.append(p)})()
    app.state.ctx.runtime = rt
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")
    return app, client, rt, pt


async def test_profile_with_transit_makes_no_http_call(settings, transit_store_file):
    import respx

    _app, client, rt, pt = _transit_world(settings, transit_store_file)
    with respx.mock(assert_all_called=False) as router:
        route = router.route().mock(return_value=httpx.Response(200, json={}))
        r = await client.get("/api/profile", params={"lat": pt[0], "lon": pt[1]})
    assert r.status_code == 200
    assert route.call_count == 0
    assert r.json()["layers"]["transit_departures"]["status"] == "pending"
    assert rt.nudges == ["transit_departures", "transit_disruptions"]


async def test_home_place_never_watches_or_nudges(settings, transit_store_file):
    app, client, rt, _pt = _transit_world(settings, transit_store_file)
    r = await client.get("/api/profile", params={"place": "home"})
    assert r.status_code == 200
    assert "transit_departures" not in r.json()["layers"]
    assert app.state.transit.watch.active(time.time()) == []
    assert rt.nudges == []


def test_httpx_logger_is_warning():
    import logging

    import shinigami.main  # noqa: F401

    assert logging.getLogger("httpx").level == logging.WARNING
