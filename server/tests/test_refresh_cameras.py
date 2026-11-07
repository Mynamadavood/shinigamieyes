import json
from pathlib import Path

import pytest
from shinigami.data.refresh_cameras import (
    cctv_record,
    direction_words,
    enforcement_kind,
    main,
    public_operator,
)

FIX = Path(__file__).parent / "fixtures" / "enforcement.osm"


@pytest.mark.parametrize("raw,exp", [
    ("45", "north-east"), ("0", "north"), ("350", "north"), ("NE", "north-east"),
    ("SSW", "south"), ("45;90", "north-east"), ("abc", None), (None, None),
])
def test_direction(raw, exp):
    assert direction_words(raw) == exp


def test_public_operator():
    assert public_operator({"operator": "City of Melbourne"}) == "City of Melbourne"
    assert public_operator({"operator": "Joes Pizza", "operator:type": "private"}) is None
    assert public_operator({"operator": "Some Shop"}) is None
    assert public_operator({"operator": "X", "operator:type": "government"}) == "X"
    for n in ["Shire of X", "Department of Y", "Victoria Police", "VicRoads", "Public Transport Victoria",
              "Metro Trains", "Yarra Trams", "V/Line", "Boroondara COUNCIL"]:
        assert public_operator({"operator": n}) == n


def test_cctv_record_filters():
    assert cctv_record(1, 0, 0, {"man_made": "surveillance", "surveillance:type": "guard"}) is None
    assert cctv_record(1, 0, 0, {"highway": "x"}) is None
    r = cctv_record(1, 1, 2, {"man_made": "surveillance", "name": "n"})
    assert "name" not in r and r["k"] == "cctv"


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
    assert "n1003" not in by
    assert "operator" not in by["n1002"]
    assert by["n1001"]["operator"] == "City of Melbourne" and by["n1001"]["direction"] == "north-east"
    assert all("name" not in c for c in d["cameras"])
