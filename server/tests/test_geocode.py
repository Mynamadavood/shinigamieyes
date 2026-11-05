import logging

import httpx
import pytest
import respx
from shinigami.api import geocode as g
from shinigami.main import create_app
from shinigami.settings import Settings

URL = g.NOMINATIM_URL
RAW = [
    {
        "lat": "-37.8",
        "lon": "144.99",
        "display_name": "Smith Street, Collingwood, City of Yarra, Victoria, Australia",
        "address": {"suburb": "Collingwood"},
    }
]


@pytest.fixture(autouse=True)
def reset_limiter(monkeypatch):
    clock = {"t": 1000.0}
    sleeps: list[float] = []

    async def fake_sleep(s):
        sleeps.append(s)
        clock["t"] += s

    monkeypatch.setattr(g, "_now", lambda: clock["t"])
    monkeypatch.setattr(g, "_sleep", fake_sleep)
    monkeypatch.setattr(g, "_last_slot", None)


@pytest.fixture
def gclient(tmp_path):
    s = Settings(
        static_dir=tmp_path / "d",
        db_path=tmp_path / "t.db",
        places_path=tmp_path / "p.toml",
        contact_email="ops@example.test",
    )
    app = create_app(s, start_runtime=False)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@respx.mock
async def test_maps_and_sends_policy_params(gclient):
    route = respx.get(URL).respond(200, json=RAW)
    r = await gclient.get("/api/geocode", params={"q": "smith st collingwood"})
    assert r.status_code == 200
    assert r.json() == [
        {"label": "Smith Street, Collingwood", "suburb": "Collingwood", "lat": -37.8, "lon": 144.99}
    ]
    req = route.calls[0].request
    assert req.headers["user-agent"].startswith("ShinigamiEyes/")
    assert "ops@example.test" in req.headers["user-agent"]
    qs = dict(req.url.params)
    assert qs["format"] == "jsonv2" and qs["countrycodes"] == "au"
    assert qs["limit"] == "5" and qs["addressdetails"] == "1" and "viewbox" in qs


@respx.mock
async def test_cache_hit_normalised(gclient):
    route = respx.get(URL).respond(200, json=RAW)
    await gclient.get("/api/geocode", params={"q": "smith st"})
    r = await gclient.get("/api/geocode", params={"q": "  SMITH   st  "})
    assert r.status_code == 200 and len(r.json()) == 1
    assert route.call_count == 1


async def test_short_query_422(gclient):
    assert (await gclient.get("/api/geocode", params={"q": "ab"})).status_code == 422


async def test_long_query_422(gclient):
    assert (await gclient.get("/api/geocode", params={"q": "a" * 121})).status_code == 422


async def test_whitespace_padded_short_query_422(gclient):
    assert (await gclient.get("/api/geocode", params={"q": "  ab  "})).status_code == 422


@respx.mock
async def test_second_call_waits_one_second(gclient, monkeypatch):
    # freeze time so no real time elapses between calls
    monkeypatch.setattr(g, "_now", lambda: 1000.0)
    waits: list[float] = []

    async def rec(s):
        waits.append(s)

    monkeypatch.setattr(g, "_sleep", rec)
    respx.get(URL).respond(200, json=RAW)
    await gclient.get("/api/geocode", params={"q": "aaa one"})
    await gclient.get("/api/geocode", params={"q": "bbb two"})
    assert waits == [1.0]


@respx.mock
async def test_backlog_over_3s_is_429(gclient, monkeypatch):
    monkeypatch.setattr(g, "_now", lambda: 1000.0)

    async def noop(s):
        return None

    monkeypatch.setattr(g, "_sleep", noop)
    respx.get(URL).respond(200, json=RAW)
    codes = []
    for i in range(6):
        r = await gclient.get("/api/geocode", params={"q": f"query number {i}"})
        codes.append(r.status_code)
    assert codes == [200, 200, 200, 200, 429, 429]


@respx.mock
async def test_upstream_error_no_cache_is_502(gclient):
    respx.get(URL).respond(500)
    r = await gclient.get("/api/geocode", params={"q": "nowhere street"})
    assert r.status_code == 502 and r.json() == {"detail": "search_failed"}


@respx.mock
async def test_upstream_timeout_is_502(gclient):
    respx.get(URL).mock(side_effect=httpx.ReadTimeout("x"))
    r = await gclient.get("/api/geocode", params={"q": "nowhere street"})
    assert r.status_code == 502


@respx.mock
async def test_cached_entry_survives_upstream_failure(gclient):
    respx.get(URL).respond(200, json=RAW)
    await gclient.get("/api/geocode", params={"q": "smith st"})
    respx.get(URL).respond(500)
    r = await gclient.get("/api/geocode", params={"q": "smith st"})
    assert r.status_code == 200 and r.json()[0]["suburb"] == "Collingwood"


async def test_no_contact_email_refuses_without_upstream(client):
    with respx.mock(assert_all_called=False) as m:
        route = m.get(URL).respond(200, json=RAW)
        r = await client.get("/api/geocode", params={"q": "smith st"})
        assert r.status_code == 502
        assert route.call_count == 0


@respx.mock
async def test_logs_never_contain_query(gclient, caplog):
    caplog.set_level(logging.INFO)
    respx.get(URL).respond(500)
    await gclient.get("/api/geocode", params={"q": "secretplace lane"})
    assert "secretplace" not in caplog.text.lower()
