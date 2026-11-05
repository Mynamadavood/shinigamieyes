import time

import httpx
from shinigami.api import health
from shinigami.main import create_app


async def test_health_payload(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert abs(body["server_time"] - time.time()) < 5
    assert r.headers["cache-control"] == "no-store"


async def test_security_headers(client):
    r = await client.get("/api/health")
    csp = r.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"


async def test_static_cache_headers(settings):
    d = settings.static_dir
    (d / "assets").mkdir(parents=True)
    (d / "index.html").write_text("<html>Shinigami Eyes</html>")
    (d / "sw.js").write_text("//sw")
    (d / "assets" / "app-abc.js").write_text("//js")
    app = create_app(settings)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        assert (await c.get("/")).headers["cache-control"] == "no-cache"
        assert (await c.get("/sw.js")).headers["cache-control"] == "no-cache"
        assert "immutable" in (await c.get("/assets/app-abc.js")).headers["cache-control"]
        assert (await c.get("/api/health")).status_code == 200


async def test_missing_static_dir_ok(client, settings):
    assert not settings.static_dir.exists()
    assert (await client.get("/api/health")).status_code == 200


async def test_sse_probe_ticks(client, monkeypatch):
    monkeypatch.setattr(health, "PROBE_INTERVAL_S", 0.01)
    r = await client.get("/api/_sse_probe?n=2")
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.text.count("event: tick") == 2


async def test_sse_probe_bounded(client):
    assert (await client.get("/api/_sse_probe?n=500")).status_code == 422
