import contextlib
import json
import logging
import socket
import threading
import time

import httpx
import pytest
import uvicorn
from shinigami.api import stream as stream_mod
from shinigami.geo import snap_cell
from shinigami.main import create_app
from shinigami.schema import ProfileLocation


def _loc():
    return ProfileLocation(source="gps", lat=-37.81, lon=144.96)


@pytest.mark.asyncio
async def test_event_stream_order_filter_and_unsubscribe(app, frozen_now):
    ctx = app.state.ctx
    ctx.clock = lambda: frozen_now
    lat, lon = -37.81, 144.96
    cell = snap_cell(lat, lon).id
    state = {"dc": False}

    async def dc():
        return state["dc"]

    gen = stream_mod.event_stream(ctx, app.state.providers, _loc(), lat, lon, dc)
    first = await gen.__anext__()
    assert first.event == "hello"
    assert len(ctx.bus._subs) == 1  # subscribed by the time hello is out
    assert "server_time" in json.loads(first.data)
    layers = []
    for _ in range(3):
        ev = await gen.__anext__()
        assert ev.event == "layer"
        layers.append(json.loads(ev.data)["id"])
    assert set(layers) == {"sun", "uv_now", "uv_window"}

    def layer(i):
        return {"id": i, "status": "fresh", "rev": 1, "as_of": 1.0, "attribution": "", "items": []}

    ctx.bus.publish({"type": "layer", "provider": "x", "cell": "other", "layer": layer("nope")})
    ctx.bus.publish({"type": "layer", "provider": "x", "cell": cell, "layer": layer("mine")})
    ctx.bus.publish({"type": "layer", "provider": "x", "cell": "global", "layer": layer("glob")})
    got = [json.loads((await gen.__anext__()).data)["id"] for _ in range(2)]
    assert got == ["mine", "glob"]
    state["dc"] = True
    with pytest.raises(StopAsyncIteration):
        await gen.__anext__()
    assert ctx.bus._subs == []


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _start(app):
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            timeout_graceful_shutdown=5,
            access_log=False,
            log_level="warning",
        )
    )
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    return server, t, f"http://127.0.0.1:{port}"


@pytest.fixture
def live(settings):
    server, t, base = _start(create_app(settings, start_runtime=False))
    yield server, t, base
    server.should_exit = True
    t.join(10)


def _first_event(url):
    with httpx.stream("GET", url, timeout=5) as r:
        assert r.status_code == 200
        hdrs = r.headers
        for line in r.iter_lines():
            if line.startswith("event:"):
                return hdrs, line
    return None, None


def test_endpoint_headers_and_hello(live):
    _, _, base = live
    hdrs, line = _first_event(base + "/api/stream?lat=-37.81&lon=144.96")
    assert hdrs["content-type"].startswith("text/event-stream")
    assert "no-cache" in hdrs["cache-control"]
    assert hdrs["x-accel-buffering"] == "no"
    assert line.split(":", 1)[1].strip() == "hello"


def test_endpoint_validation(live):
    _, _, base = live
    assert httpx.get(base + "/api/stream?lat=95&lon=144").status_code == 422
    assert httpx.get(base + "/api/stream?lat=-37").status_code == 422


def test_ping_is_named_event(settings, monkeypatch):
    monkeypatch.setattr(stream_mod, "PING_INTERVAL_S", 1.0)
    server, t, base = _start(create_app(settings, start_runtime=False))
    try:
        names = []
        deadline = time.time() + 3.5
        with httpx.stream("GET", base + "/api/stream", timeout=5) as r:
            for line in r.iter_lines():
                if line.startswith("event:"):
                    names.append(line.split(":", 1)[1].strip())
                if "ping" in names or time.time() > deadline:
                    break
        assert "ping" in names
    finally:
        server.should_exit = True
        t.join(10)


def test_graceful_shutdown_with_open_stream(live):
    server, t, base = live
    cm = httpx.stream("GET", base + "/api/stream", timeout=10)
    r = cm.__enter__()
    next(r.iter_lines())
    server.should_exit = True
    t.join(8)
    assert not t.is_alive()
    with contextlib.suppress(Exception):
        cm.__exit__(None, None, None)


def test_no_coordinates_logged(live, caplog):
    _, _, base = live
    caplog.set_level(logging.DEBUG)
    _first_event(base + "/api/stream?lat=-37.8123&lon=144.9634")
    # the test's own httpx client logs the URL in-process; only server-side loggers count
    server_side = [r for r in caplog.records if not r.name.startswith(("httpx", "httpcore"))]
    text = "\n".join(r.getMessage() for r in server_side)
    assert "37.8123" not in text and "144.9634" not in text
