import json
import logging
import os
import time

from shinigami.cameras_store import CameraStore
from shinigami.geo import haversine_m
from shinigami.providers.base import ProviderContext
from shinigami.providers.cameras import MAX_ITEMS, CctvCameraProvider, RoadCameraProvider

LAT, LON = -37.8136, 144.9631  # CBD, public point
NOW = 1793858400.0


def dlat(m: float) -> float:
    return m / 111_195.0


def write(path, cams, built_at=1700000000.0):
    path.write_text(
        json.dumps({"version": 1, "built_at": built_at, "source": "t", "cameras": cams})
    )


def cam(i, k, metres, **extra):
    return {"id": f"{k}{i}", "k": k, "lat": LAT + dlat(metres), "lon": LON, **extra}


def ctx():
    return ProviderContext(settings=None, clock=lambda: NOW)


def mk(tmp_path, cams):
    p = tmp_path / "c.json"
    write(p, cams)
    s = CameraStore(p)
    assert s.load()
    return s


def test_guard_in_cctv_layer_not_road(tmp_path):
    s = mk(tmp_path, [cam(1, "cctv", 50), cam(2, "guard", 60, operator="Acme Security")])
    cctv = CctvCameraProvider(s).query(ctx(), LAT, LON, NOW)
    assert cctv.items[0].detail["count"] == 2
    g = [i for i in cctv.items if i.group == "guard"]
    assert len(g) == 1 and g[0].name == "Guard post"
    assert "alert" not in g[0].model_dump_json().lower()
    road = RoadCameraProvider(s).query(ctx(), LAT, LON, NOW)
    assert all(i.group != "guard" for i in road.items)


def test_missing_file_pending(tmp_path):
    s = CameraStore(tmp_path / "none.json")
    s.load()
    for prov in (CctvCameraProvider(s), RoadCameraProvider(s)):
        layer = prov.query(ctx(), LAT, LON, NOW)
        assert layer.status == "pending" and layer.items == []


def test_radius_in_out(tmp_path):
    s = mk(
        tmp_path,
        [cam(1, "cctv", 100), cam(2, "cctv", 200), cam(3, "speed", 900), cam(4, "redlight", 1100)],
    )
    cctv = CctvCameraProvider(s).query(ctx(), LAT, LON, NOW)
    assert [i.id for i in cctv.items if i.group != "summary"] == ["cam:cctv1"]
    road = RoadCameraProvider(s).query(ctx(), LAT, LON, NOW)
    assert [i.id for i in road.items if i.group != "summary"] == ["cam:speed3"]


def test_cap_and_uncapped_count(tmp_path):
    s = mk(tmp_path, [cam(i, "cctv", 10 + i) for i in range(70)])
    layer = CctvCameraProvider(s).query(ctx(), LAT, LON, NOW)
    cams = [i for i in layer.items if i.group != "summary"]
    assert len(cams) == MAX_ITEMS == 60
    summary = next(i for i in layer.items if i.group == "summary")
    assert summary.detail["count"] == 70 and summary.detail["radius_m"] == 150
    d = [i.detail["distance_m"] for i in cams]
    assert d == sorted(d)


def test_zero_count_fresh(tmp_path):
    s = mk(tmp_path, [cam(1, "cctv", 5000)])
    layer = CctvCameraProvider(s).query(ctx(), LAT, LON, NOW)
    assert layer.status == "fresh"
    assert len(layer.items) == 1 and layer.items[0].detail["count"] == 0
    assert layer.as_of == 1700000000.0


def test_item_shape_and_no_alert_words(tmp_path):
    s = mk(
        tmp_path,
        [
            cam(1, "cctv", 50, camera_type="dome", operator="X", direction=None, road="unknown"),
            cam(2, "redlight", 300, road="Main Rd"),
        ],
    )
    cctv = CctvCameraProvider(s).query(ctx(), LAT, LON, NOW)
    it = cctv.items[1]
    assert it.kind == "infrastructure" and it.target_ts is None and it.computed
    assert it.geom == {"type": "Point", "coordinates": [LON, LAT + dlat(50)]}
    assert isinstance(it.detail["distance_m"], int)
    assert all(v not in (None, "unknown") for v in it.detail.values())
    assert "direction" not in it.detail and "road" not in it.detail
    road = RoadCameraProvider(s).query(ctx(), LAT, LON, NOW)
    assert road.items[1].name == "Red-light camera"
    text = (cctv.model_dump_json() + road.model_dump_json()).lower()
    for w in ("ahead", "approaching", "alert"):
        assert w not in text
    assert abs(haversine_m(LAT, LON, LAT + dlat(50), LON) - 50) < 1


def test_reload_and_corrupt(tmp_path, caplog):
    p = tmp_path / "c.json"
    write(p, [cam(1, "cctv", 50)])
    s = CameraStore(p)
    s.load()
    assert len(s.near(LAT, LON, 150, {"cctv"})) == 1
    assert not s.reload_if_changed()
    write(p, [cam(1, "cctv", 50), cam(2, "cctv", 60)])
    os.utime(p, (time.time() + 10, time.time() + 10))
    assert s.reload_if_changed()
    assert len(s.near(LAT, LON, 150, {"cctv"})) == 2
    p.write_text("{not json")
    os.utime(p, (time.time() + 20, time.time() + 20))
    with caplog.at_level(logging.DEBUG):
        assert not s.reload_if_changed()
    assert len(s.near(LAT, LON, 150, {"cctv"})) == 2
    assert "JSONDecodeError" in caplog.text and "not json" not in caplog.text


async def test_profile_includes_layers_gps(settings):
    import httpx
    from shinigami.main import create_app

    write(settings.cameras_path, [cam(1, "cctv", 50), cam(2, "speed", 500)])
    app = create_app(settings, start_runtime=False)
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    j = (await c.get("/api/profile", params={"lat": LAT, "lon": LON})).json()
    assert j["location"]["cell_lat"] is None
    assert j["layers"]["cameras_cctv"]["items"][0]["detail"]["count"] == 1
    assert j["layers"]["cameras_road"]["items"][0]["detail"]["count"] == 1
