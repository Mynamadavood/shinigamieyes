import json
import logging

import httpx
import pytest
from shinigami.main import create_app
from shinigami.providers.base import ProviderContext
from shinigami.providers.transit import TransitStopsProvider
from shinigami.settings import Settings
from shinigami.transit.service import ATTRIBUTION, TransitService
from shinigami.transit.store import TransitStore

LAT, LON = -37.0, 144.0  # synthetic point
NOW = 1793858400.0


def dlat(m: float) -> float:
    return m / 111_195.0


def tram_stop(i=1, metres=27, name="Synthetic Tram Stop"):
    return {
        "id": i,
        "mode": "tram",
        "name": name,
        "poles": [[LAT + dlat(metres), LON, ["96:0", "96:1"]]],
        "gtfs_ids": [str(i)],
        "routes": ["96"],
    }


def make_provider(transit_store_file, stops, devid=None, key=None):
    path = transit_store_file(stops)
    store = TransitStore(path)
    store.load()
    return TransitStopsProvider(TransitService(store, devid, key))


def ctx():
    return ProviderContext(settings=None, clock=lambda: NOW)


def test_settings_default_no_ptv(monkeypatch):
    monkeypatch.delenv("PTV_DEVID", raising=False)
    monkeypatch.delenv("PTV_KEY", raising=False)
    s = Settings(_env_file=None)
    assert s.ptv_devid is None and s.ptv_key is None


def test_settings_reads_unprefixed_env_as_secret(monkeypatch):
    monkeypatch.setenv("PTV_DEVID", "1000001")
    monkeypatch.setenv("PTV_KEY", "fake-key-value")
    s = Settings(_env_file=None)
    assert s.ptv_devid.get_secret_value() == "1000001"
    assert s.ptv_key.get_secret_value() == "fake-key-value"
    assert "fake-key-value" not in repr(s) and "1000001" not in repr(s)
    assert Settings(_env_file=None, ptv_devid="9", ptv_key="k").ptv_key.get_secret_value() == "k"


def test_provider_meta():
    m = TransitStopsProvider.meta
    assert m.id == "transit_stops" and m.tier == "computed"
    assert m.exact_location_only is True
    assert m.attribution == ATTRIBUTION


def test_query_stop_none_and_summary(transit_store_file):
    p = make_provider(transit_store_file, [tram_stop()])
    layer = p.query(ctx(), LAT, LON, NOW)
    assert layer.id == "transit_stops" and layer.status == "fresh"
    by_id = {i.id: i for i in layer.items}
    stop = by_id["stop:1"]
    assert stop.name == "Synthetic Tram Stop" and stop.group == "tram"
    assert stop.detail["mode"] == "tram" and stop.detail["distance_m"] == 27
    assert stop.detail["walk_s"] > 0
    assert stop.geom["type"] == "Point"
    assert stop.geom["coordinates"][0] == pytest.approx(LON)
    assert by_id["none:train"].name == "No train station within 1.5 km"
    assert by_id["none:bus"].name == "No bus stop within 500 m"
    assert by_id["none:train"].detail == {"mode": "train", "none": True, "limit_m": 1500}
    assert "none:tram" not in by_id
    assert by_id["transit:summary"].detail == {"summary": True, "ptv": "no_key"}


def test_query_ptv_idle_when_keys_present(transit_store_file):
    p = make_provider(transit_store_file, [], devid="1", key="k")
    assert p.query(ctx(), LAT, LON, NOW).items[0].detail["ptv"] == "idle"
    assert "tram" not in {i.id for i in p.query(ctx(), LAT, LON, NOW).items if i.id == "none:tram"}


def test_query_pending_when_not_loaded(tmp_path):
    store = TransitStore(tmp_path / "absent.json")
    store.load()
    layer = TransitStopsProvider(TransitService(store, None, None)).query(ctx(), LAT, LON, NOW)
    assert layer.status == "pending" and layer.items == []


def test_service_repr_hides_secrets(tmp_path):
    svc = TransitService(TransitStore(tmp_path / "x.json"), "1000001", "fake-key-value")
    assert svc.ptv_configured
    assert "fake-key-value" not in repr(svc) and "1000001" not in repr(svc)
    assert not TransitService(TransitStore(tmp_path / "x.json"), "1", "  ").ptv_configured


# ---- integration: profile, Home gate, stream, health ----

HOME = (-10.5321, 120.5432)  # fictional point, open sea
CBD = (-37.8136, 144.9631)


def _stop(i, mode, lat, lon, name, dirs):
    return {
        "id": i,
        "mode": mode,
        "name": name,
        "poles": [[lat, lon, dirs]],
        "gtfs_ids": [str(i)],
        "routes": sorted({d.split(":")[0] for d in dirs}),
    }


def _world(settings, transit_store_file):
    transit_store_file(
        [
            _stop(11, "tram", CBD[0] + 0.0003, CBD[1], "Synthetic Tram Stop", ["96:0", "96:1"]),
            _stop(12, "tram", HOME[0] + 0.0003, HOME[1], "Home Side Stop", ["5:0", "5:1"]),
        ]
    )
    h, c = HOME, CBD
    toml = (
        '[[place]]\nid = "home"\nlabel = "Home"\nis_home = true\n'
        f'lat = {h[0]}\nlon = {h[1]}\n\n'
        '[[place]]\nid = "cbd"\nlabel = "CBD"\n'
        f'lat = {c[0]}\nlon = {c[1]}\n\n'
        '[[place]]\nid = "nocam"\nlabel = "N"\ncameras = false\n'
        f'lat = {c[0]}\nlon = {c[1]}\n'
    )
    settings.places_path.write_text(toml)
    app = create_app(settings, start_runtime=False)
    return app, httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")


async def test_profile_gps_has_transit_stops(settings, transit_store_file):
    _app, c = _world(settings, transit_store_file)
    r = await c.get("/api/profile", params={"lat": CBD[0], "lon": CBD[1]})
    layer = r.json()["layers"]["transit_stops"]
    assert layer["status"] == "fresh"
    ids = {i["id"] for i in layer["items"]}
    assert {"stop:11", "none:train", "none:bus", "transit:summary"} <= ids
    stop = next(i for i in layer["items"] if i["id"] == "stop:11")
    assert stop["detail"]["distance_m"] > 0 and stop["detail"]["mode"] == "tram"


async def test_profile_non_home_place_gets_stops(settings, transit_store_file):
    _app, c = _world(settings, transit_store_file)
    r = await c.get("/api/profile", params={"place": "cbd"})
    body = r.json()
    assert body["location"]["lat"] is None and body["location"]["lon"] is None
    items = body["layers"]["transit_stops"]["items"]
    assert any(i["detail"].get("distance_m") for i in items)


@pytest.mark.parametrize("place", ["home", "nocam"])
async def test_profile_home_and_camera_off_have_no_transit(settings, transit_store_file, place):
    _app, c = _world(settings, transit_store_file)
    r = await c.get("/api/profile", params={"place": place})
    assert not [k for k in r.json()["layers"] if k.startswith("transit_")]
    assert "distance_m" not in r.text
    assert str(HOME[0]) not in r.text and str(HOME[1]) not in r.text


async def test_stream_home_has_no_transit_frame(settings, transit_store_file):
    from shinigami.api.profile import camera_ok, resolve_location
    from shinigami.api.stream import event_stream

    app, _ = _world(settings, transit_store_file)

    class Req:
        pass

    req = Req()
    req.app = app

    async def dc():
        return False

    for pid, expect in (("home", False), ("cbd", True)):
        location, la, lo = resolve_location(req, None, None, pid)
        ctx = app.state.ctx
        gen = event_stream(
            ctx, app.state.providers, location, la, lo, dc, exact_ok=camera_ok(req, location)
        )
        first = await gen.__anext__()
        assert first.event == "hello"
        ids = []
        n = sum(1 for p in app.state.providers if expect or not p.meta.exact_location_only)
        for _ in range(n):
            ev = await gen.__anext__()
            ids.append(json.loads(ev.data)["id"])
        await gen.aclose()
        assert ("transit_stops" in ids) is expect


async def test_health_transit_block(settings, transit_store_file):
    _app, c = _world(settings, transit_store_file)
    r = await c.get("/api/health")
    t = r.json()["transit"]
    assert t == {
        "stops": {"loaded": True, "count": 2, "age_days": 2},
        "ptv": "no_key",
        "live_age_s": None,
    }
    low = r.text.lower()
    assert "devid" not in low and "signature" not in low
    assert str(CBD[0])[:7] not in r.text and str(HOME[0])[:7] not in r.text


async def test_health_transit_missing_file(client):
    t = (await client.get("/api/health")).json()["transit"]
    assert t["stops"]["loaded"] is False and t["stops"]["age_days"] is None


async def test_no_file_layer_pending(client):
    r = await client.get("/api/profile", params={"lat": CBD[0], "lon": CBD[1]})
    assert r.json()["layers"]["transit_stops"]["status"] == "pending"


async def test_no_stop_names_or_coords_in_logs(settings, transit_store_file, caplog):
    _app, c = _world(settings, transit_store_file)
    with caplog.at_level(logging.DEBUG):
        await c.get("/api/profile", params={"lat": CBD[0], "lon": CBD[1]})
        await c.get("/api/profile", params={"place": "cbd"})
        await c.get("/api/health")
    text = caplog.text
    assert "Synthetic Tram Stop" not in text and "Home Side Stop" not in text
    assert str(CBD[0]) not in text and str(HOME[0]) not in text
