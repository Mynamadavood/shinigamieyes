import json
from pathlib import Path

import pytest
from shinigami.data.refresh_cameras import (
    cctv_record,
    direction_words,
    enforcement_kind,
    main,
    shown_operator,
)

FIX = Path(__file__).parent / "fixtures" / "enforcement.osm"


@pytest.mark.parametrize("raw,exp", [
    ("45", "north-east"), ("0", "north"), ("350", "north"), ("NE", "north-east"),
    ("SSW", "south"), ("45;90", "north-east"), ("abc", None), (None, None),
    ("nan", None), ("inf", None), ("-inf", None), ("NaN;90", None),
])
def test_direction(raw, exp):
    assert direction_words(raw) == exp


def test_shown_operator():
    assert shown_operator({"operator": "Joes Pizza"}) == "Joes Pizza"
    assert shown_operator({"operator": "City of Melbourne"}) == "City of Melbourne"
    for t in ("private", "individual", "personal"):
        assert shown_operator({"operator": "X", "operator:type": t}) is None
    assert shown_operator({"operator": "X", "operator:type": "government"}) == "X"
    for b in ("house", "residential", "apartments", "detached", "semidetached_house", "terrace"):
        assert shown_operator({"operator": "Acme", "building": b}) is None
    assert shown_operator({"operator": "Acme", "addr:housenumber": "12"}) is None
    for k in ("shop", "amenity", "office", "tourism", "leisure"):
        assert shown_operator({"operator": "Acme", "addr:housenumber": "12", k: "y"}) == "Acme"
    for v in ("a@b.c", "see http://x", "www.x.com", "0412345678"):
        assert shown_operator({"operator": v}) is None
    # review CR-S2: grouped AU phone formats, bare domains and emails
    for v in (
        "0412 345 678",
        "J Smith 0412 345 678",
        "03 9123 4567",
        "+61 3 9123 4567",
        "(03) 9123-4567",
        "1300 123 456",
        "03.9123.4567",
        "example.com.au",
        "Joes Pizza example.com.au",
        "facebook.com/joesmith",
        "joe.smith@example.com",
    ):
        assert shown_operator({"operator": v}) is None, v
    for v in ("7-Eleven", "Coles Supermarkets", "Metro Trains", "Westfield Doncaster"):
        assert shown_operator({"operator": v}) == v
    assert shown_operator({"operator": "   "}) is None
    assert shown_operator({}) is None


def test_cctv_record_filters():
    assert cctv_record(1, 0, 0, {"highway": "x"}) is None
    g = cctv_record(1, 0, 0, {"man_made": "surveillance", "surveillance:type": "guard"})
    assert g["k"] == "guard"
    r = cctv_record(1, 1, 2, {"man_made": "surveillance", "name": "n"})
    assert "name" not in r and r["k"] == "cctv"
    r = cctv_record(1, 1, 2, {
        "man_made": "surveillance", "name": "n", "contact:phone": "1", "phone": "2",
        "email": "e", "website": "w", "contact:email": "x", "operator": "Z", "operator:type": "private",
    })
    assert set(r) <= {"id", "k", "lat", "lon", "camera_type", "direction", "operator", "surveillance", "suburb"}
    assert "operator" not in r


def test_cctv_record_survives_non_finite_direction():
    r = cctv_record(1, 1, 2, {"man_made": "surveillance", "camera:direction": "nan"})
    assert r is not None and "direction" not in r


def test_enforcement_kind():
    assert enforcement_kind("traffic_signals") == "redlight"
    assert enforcement_kind("maxspeed") == "speed"
    assert enforcement_kind("average_speed") == "speed"
    assert enforcement_kind("parking") is None


def test_end_to_end(tmp_path):
    pytest.importorskip("osmium")
    out = tmp_path / "cameras.json"
    assert main(["--input", str(FIX), "--output", str(out)]) == 0
    assert not out.with_suffix(".tmp").exists()
    d = json.loads(out.read_text())
    by = {c["id"]: c for c in d["cameras"]}
    assert by["n2001"]["k"] == "redlight"
    assert by["n2003"]["k"] == "speed" and by["n2003"]["road"] == "Burwood Highway"
    assert by["n1003"]["k"] == "guard" and by["n1003"]["operator"] == "Acme Security"
    assert "operator" not in by["n1002"]
    assert by["n1001"]["operator"] == "City of Melbourne" and by["n1001"]["direction"] == "north-east"
    banned = {"name", "phone", "email", "website"}
    assert all(not (banned & set(c)) and not any(k.startswith("contact") for k in c) for c in d["cameras"])


def _fake_build(n):
    cams = [{"id": f"n{i}", "k": "cctv", "lat": 0.0, "lon": 0.0} for i in range(n)]
    return lambda path: {"version": 1, "built_at": 1.0, "source": "t", "cameras": cams}


def test_refuses_to_shrink_dataset(tmp_path, monkeypatch, capsys):
    # Review WR-S5: empty or much smaller output keeps the old file and exits non-zero.
    import shinigami.data.refresh_cameras as rc

    out = tmp_path / "cameras.json"
    monkeypatch.setattr(rc, "build", _fake_build(0))
    assert main(["--input", "x", "--output", str(out)]) == 1
    assert not out.exists()
    monkeypatch.setattr(rc, "build", _fake_build(10))
    assert main(["--input", "x", "--output", str(out)]) == 0
    before = out.read_text()
    for n in (0, 4):
        monkeypatch.setattr(rc, "build", _fake_build(n))
        assert main(["--input", "x", "--output", str(out)]) == 1
        assert out.read_text() == before
        assert not out.with_suffix(".tmp").exists()
    assert "new=4 old=10" in capsys.readouterr().out
    monkeypatch.setattr(rc, "build", _fake_build(6))
    assert main(["--input", "x", "--output", str(out)]) == 0
    assert len(json.loads(out.read_text())["cameras"]) == 6
    monkeypatch.setattr(rc, "build", _fake_build(1))
    assert main(["--input", "x", "--output", str(out), "--force"]) == 0
    assert len(json.loads(out.read_text())["cameras"]) == 1
