import pytest
from pydantic import ValidationError
from shinigami.geo import haversine_m, snap_cell
from shinigami.schema import Item, Layer, Profile, ProfileLocation


def make_item(**kw):
    base = {
        "id": "x:1",
        "layer": "x",
        "group": "g",
        "name": "N",
        "verb": "v",
        "target_ts": 1.0,
        "kind": "environment",
        "fetched_at": 0.0,
        "stale_after_s": None,
    }
    base.update(kw)
    return Item(**base)


def test_person_kind_rejected():
    with pytest.raises(ValidationError):
        make_item(kind="person")


def test_severity_bounds():
    with pytest.raises(ValidationError):
        make_item(severity=4)
    assert make_item(severity=3).severity == 3


def test_item_frozen():
    it = make_item()
    with pytest.raises(ValidationError):
        it.name = "other"


def test_profile_roundtrip():
    p = Profile(
        server_time=10.0,
        rev=1,
        location=ProfileLocation(source="default", lat=-37.8, lon=144.9, label="Melbourne CBD"),
        layers={
            "x": Layer(
                id="x", status="fresh", rev=1, as_of=10.0, attribution="a", items=[make_item()]
            )
        },
    )
    again = Profile.model_validate_json(p.model_dump_json())
    assert again == p


def test_snap_cell_and_haversine():
    c = snap_cell(-37.8136, 144.9631)
    assert c.id == "-37.8,145.0"
    assert (c.lat, c.lon) == (-37.8, 145.0)
    d = haversine_m(-37.8136, 144.9631, -37.8136 + 100 / 111195.0, 144.9631)
    assert abs(d - 100) < 1
