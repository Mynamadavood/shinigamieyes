import json
import logging
import os

from shinigami.transit.store import LIMITS_M, TransitStore, walk_seconds

LAT, LON = -37.0, 144.0  # synthetic point


def dlat(m: float) -> float:
    return m / 111_195.0


def stop(i, mode, metres, dirs, name=None, extra_poles=()):
    poles = [[LAT + dlat(metres), LON, list(dirs)], *extra_poles]
    return {"id": i, "mode": mode, "name": name or f"S{i}", "poles": poles, "gtfs_ids": [str(i)],
            "routes": sorted({k.split(":")[0] for k in dirs})}


def write(path, stops, version=1):
    path.write_text(json.dumps({"version": version, "built_at": 1.0, "source": "t", "stops": stops}))


def store(tmp_path, stops):
    p = tmp_path / "t.json"
    write(p, stops)
    s = TransitStore(p)
    assert s.load()
    return s


def test_tram_both_directions_single(tmp_path):
    s = store(tmp_path, [stop(1, "tram", 27, ["96:0", "96:1"]), stop(2, "tram", 300, ["96:0"])])
    r = s.nearby(LAT, LON)
    assert [x.id for x in r.stops] == [1]
    assert r.none_modes == ("train", "bus")
    assert r.stops[0].distance_m == 27 and r.stops[0].route_type == 1


def test_bus_opposite_pair(tmp_path):
    s = store(tmp_path, [
        stop(1, "bus", 150, ["907:1"]),
        stop(2, "bus", 240, ["907:0"]),
        stop(3, "bus", 200, ["907:1"]),
    ])
    r = s.nearby(LAT, LON)
    assert [x.id for x in r.stops] == [1, 2]


def test_limits(tmp_path):
    assert LIMITS_M == {"train": 1500, "tram": 800, "bus": 500}
    s = store(tmp_path, [stop(1, "train", 1452, ["A:0"])])
    assert [x.id for x in s.nearby(LAT, LON).stops] == [1]
    s = store(tmp_path, [stop(1, "train", 1520, ["A:0"]), stop(2, "tram", 810, ["9:0", "9:1"]),
                         stop(3, "bus", 501, ["7:0", "7:1"])])
    r = s.nearby(LAT, LON)
    assert r.stops == () and r.none_modes == ("train", "tram", "bus")


def test_empty(tmp_path):
    assert store(tmp_path, []).nearby(LAT, LON).none_modes == ("train", "tram", "bus")


def test_min_pole_and_walk(tmp_path):
    far = [LAT + dlat(90), LON, ["96:0", "96:1"]]
    s = store(tmp_path, [stop(1, "tram", 400, ["96:0", "96:1"], extra_poles=[far])])
    n = s.nearby(LAT, LON).stops[0]
    assert abs(n.lat - (LAT + dlat(90))) < 1e-9
    assert n.distance_m == 90 and n.walk_s == round(n.distance_m * 0.936) == walk_seconds(90)


def test_pair_from_one_direction_without_partner(tmp_path):
    s = store(tmp_path, [stop(1, "bus", 100, ["907:1"])])
    assert [x.id for x in s.nearby(LAT, LON).stops] == [1]


def test_load_failures_and_reload(tmp_path, caplog):
    p = tmp_path / "t.json"
    s = TransitStore(p)
    with caplog.at_level(logging.INFO):
        assert s.load() is False
    assert not s.loaded and "FileNotFoundError" in caplog.text and str(tmp_path) not in caplog.text
    write(p, [], version=2)
    assert s.load() is False and not s.loaded
    write(p, [stop(1, "bus", 10, ["1:0"])])
    assert s.load() and s.count == 1 and s.built_at == 1.0
    write(p, [stop(1, "bus", 10, ["1:0"]), stop(2, "bus", 20, ["1:1"])])
    st = p.stat()
    os.utime(p, (st.st_atime, st.st_mtime + 5))
    assert s.reload_if_changed() and s.count == 2
    assert not s.reload_if_changed()


def test_get(tmp_path):
    s = store(tmp_path, [stop(5, "bus", 10, ["1:0"])])
    assert s.get(5)["id"] == 5 and s.get(6) is None
