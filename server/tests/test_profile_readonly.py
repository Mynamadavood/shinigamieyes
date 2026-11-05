import socket
import time

import httpx
import pytest


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
    assert all(pid == "uv_window" for pid, _ in fake_runtime.requests)
    durations.sort()
    assert durations[int(len(durations) * 0.95) - 1] <= 0.050
