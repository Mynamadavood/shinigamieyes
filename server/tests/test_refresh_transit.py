import json
from pathlib import Path

import shinigami.data.refresh_transit as rt
from gtfs_fixture import build_gtfs_zip
from shinigami.data.refresh_transit import build_stops, main


def _by_id(recs):
    return {r["id"]: r for r in recs}


def test_build_stops(tmp_path):
    recs, counts = build_stops(build_gtfs_zip(tmp_path / "g.zip"))
    by = _by_id(recs)
    assert 9999 not in by  # regional folder ignored
    tram = by[2204]
    assert tram["mode"] == "tram" and len(tram["poles"]) == 2
    assert sorted(k for p in tram["poles"] for k in p[2]) == ["96:0", "96:1"]
    assert tram["gtfs_ids"] == ["T19499", "T19685"] and tram["routes"] == ["96"]
    train = by[1001]
    assert train["mode"] == "train" and train["name"] == "Alpha Station"
    assert len(train["poles"]) == 1  # one station at the parent position
    assert train["poles"][0][:2] == [-37.0, 144.0]
    assert "Replacement" not in train["name"] and train["gtfs_ids"] == ["P1", "P2"]
    assert by[3001]["poles"][0][2] == ["907:1"]
    assert by[3002]["poles"][0][2] == ["907:0"]
    assert 3003 not in by
    assert counts == {"train": 1, "tram": 1, "bus": 2, "skipped": 1}


def test_main_writes_counts_only(tmp_path, capsys):
    out = tmp_path / "transit_stops.json"
    assert main(["--input", str(build_gtfs_zip(tmp_path / "g.zip")), "--output", str(out)]) == 0
    assert not out.with_suffix(".tmp").exists()
    d = json.loads(out.read_text())
    assert d["version"] == 1 and len(d["stops"]) == 4
    text = capsys.readouterr().out
    assert text.strip() == "train=1 tram=1 bus=2 skipped=1"
    assert "-37." not in text and "144." not in text


def test_refuses_to_shrink(tmp_path, monkeypatch, capsys):
    out = tmp_path / "transit_stops.json"
    fake = lambda n: (lambda p: ([{"id": i} for i in range(n)], {"train": 0, "tram": 0, "bus": n, "skipped": 0}))
    monkeypatch.setattr(rt, "build_stops", fake(10))
    assert main(["--input", "x", "--output", str(out)]) == 0
    before = out.read_text()
    monkeypatch.setattr(rt, "build_stops", fake(7))
    assert main(["--input", "x", "--output", str(out)]) == 1
    assert out.read_text() == before
    assert "new=7 old=10" in capsys.readouterr().out
    monkeypatch.setattr(rt, "build_stops", fake(8))
    assert main(["--input", "x", "--output", str(out)]) == 0
    monkeypatch.setattr(rt, "build_stops", fake(1))
    assert main(["--input", "x", "--output", str(out), "--force"]) == 0
    assert len(json.loads(out.read_text())["stops"]) == 1
    assert isinstance(Path(out), Path)
