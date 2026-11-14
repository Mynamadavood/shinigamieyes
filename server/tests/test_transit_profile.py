import pytest
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
