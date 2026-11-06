import logging

import httpx
import pytest
import respx
from shinigami.api import suggest as sg
from shinigami.main import create_app
from shinigami.settings import Settings

URL = sg.PHOTON_URL


def feat(props, lon=144.97, lat=-37.79):
    return {"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [lon, lat]}}


RAW = {
    "type": "FeatureCollection",
    "features": [
        feat({"name": "Lygon Street", "district": "Carlton", "city": "Melbourne", "countrycode": "AU"}),
        # duplicate street segment in the same suburb: dropped
        feat({"name": "Lygon Street", "district": "Carlton", "city": "Melbourne", "countrycode": "AU"}),
        feat({"housenumber": "188", "street": "Lygon Street", "district": "Brunswick East", "countrycode": "AU"}),
        feat({"name": "Lygon St Barbers", "housenumber": "188", "street": "Lygon Street",
              "district": "Brunswick East", "countrycode": "AU"}),
        feat({"name": "Lygon Street", "city": "Auckland", "countrycode": "NZ"}),
        {"type": "Feature", "properties": {"name": "broken", "countrycode": "AU"}},
    ],
}


@pytest.fixture(autouse=True)
def reset_limiter(monkeypatch):
    clock = {"t": 1000.0}

    async def fake_sleep(s):
        clock["t"] += s

    monkeypatch.setattr(sg, "_now", lambda: clock["t"])
    monkeypatch.setattr(sg, "_sleep", fake_sleep)
    monkeypatch.setattr(sg, "_last_slot", None)


@pytest.fixture
def sclient(tmp_path):
    s = Settings(static_dir=tmp_path / "d", db_path=tmp_path / "t.db", places_path=tmp_path / "p.toml")
    app = create_app(s, start_runtime=False)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@respx.mock
async def test_maps_dedups_filters_and_biases_to_cbd(sclient):
    route = respx.get(URL).respond(200, json=RAW)
    r = await sclient.get("/api/suggest", params={"q": "lygon st"})
    assert r.status_code == 200
    assert r.json() == [
        {"label": "Lygon Street", "suburb": "Carlton", "lat": -37.79, "lon": 144.97},
        {"label": "188 Lygon Street", "suburb": "Brunswick East", "lat": -37.79, "lon": 144.97},
        {"label": "Lygon St Barbers, 188 Lygon Street", "suburb": "Brunswick East", "lat": -37.79, "lon": 144.97},
    ]
    req = route.calls[0].request
    qs = dict(req.url.params)
    assert qs["lat"] == sg.BIAS_LAT and qs["lon"] == sg.BIAS_LON and "bbox" in qs
    assert req.headers["user-agent"].startswith("ShinigamiEyes/")


async def test_works_without_contact_email(sclient):
    # Photon needs no contact; the default Settings has an empty contact_email.
    with respx.mock as m:
        m.get(URL).respond(200, json=RAW)
        assert (await sclient.get("/api/suggest", params={"q": "lygon"})).status_code == 200


@respx.mock
async def test_cache_hit_normalised(sclient):
    route = respx.get(URL).respond(200, json=RAW)
    await sclient.get("/api/suggest", params={"q": "lygon st"})
    r = await sclient.get("/api/suggest", params={"q": "  LYGON   st "})
    assert r.status_code == 200 and len(r.json()) == 3
    assert route.call_count == 1


@respx.mock
async def test_cache_is_separate_from_geocode(sclient):
    respx.get(URL).respond(200, json=RAW)
    await sclient.get("/api/suggest", params={"q": "lygon st"})
    store = sclient._transport.app.state.ctx.store  # type: ignore[attr-defined]
    assert store.get_geocode("lygon st") is None


async def test_short_query_422(sclient):
    assert (await sclient.get("/api/suggest", params={"q": " ab "})).status_code == 422


@respx.mock
async def test_spacing_and_backlog_429(sclient, monkeypatch):
    monkeypatch.setattr(sg, "_now", lambda: 1000.0)
    waits: list[float] = []

    async def rec(s):
        waits.append(s)

    monkeypatch.setattr(sg, "_sleep", rec)
    respx.get(URL).respond(200, json=RAW)
    codes = [(await sclient.get("/api/suggest", params={"q": f"street {i}"})).status_code for i in range(4)]
    assert codes == [200, 200, 200, 429]
    assert waits == [0.5, 1.0]


@respx.mock
async def test_upstream_error_is_502(sclient):
    respx.get(URL).respond(503)
    r = await sclient.get("/api/suggest", params={"q": "nowhere st"})
    assert r.status_code == 502 and r.json() == {"detail": "search_failed"}


@respx.mock
async def test_logs_never_contain_query(sclient, caplog):
    caplog.set_level(logging.INFO)
    respx.get(URL).mock(side_effect=httpx.ConnectTimeout("x"))
    await sclient.get("/api/suggest", params={"q": "secretplace lane"})
    assert "secretplace" not in caplog.text.lower()
