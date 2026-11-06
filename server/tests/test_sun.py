from datetime import datetime
from zoneinfo import ZoneInfo

from shinigami.providers.sun import sun_boundaries

MEL = ZoneInfo("Australia/Melbourne")
LAT, LON = -37.8136, 144.9631
GROUPS = {"golden_morning", "golden_evening", "blue_morning", "blue_evening"}
NAMES = {"Golden hour starts", "Golden hour ends", "Blue hour starts", "Blue hour ends"}
H36 = 36 * 3600


def ts(y, mo, d, h, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=MEL).timestamp()


def local(t):
    return datetime.fromtimestamp(t, MEL)


def test_basic_shape(frozen_now):
    items = sun_boundaries(LAT, LON, frozen_now)
    assert items
    stamps = [i.target_ts for i in items]
    assert stamps == sorted(stamps)
    for i in items:
        assert frozen_now <= i.target_ts <= frozen_now + H36
        assert i.group in GROUPS
        assert i.name in NAMES
        assert i.kind == "environment"
        assert i.computed is True
        assert i.stale_after_s is None


def test_golden_end_equals_blue_start(frozen_now):
    items = sun_boundaries(LAT, LON, frozen_now)
    ge = next(i for i in items if i.group == "golden_evening" and i.verb == "ends")
    bs = next(i for i in items if i.group == "blue_evening" and i.verb == "starts")
    assert abs(ge.target_ts - bs.target_ts) < 1
    lt = local(ge.target_ts)
    assert lt.date().isoformat() == "2026-11-05"
    assert (19, 50) <= (lt.hour, lt.minute) <= (20, 45)


def test_date_rollover():
    now = ts(2026, 11, 5, 23, 30)
    items = sun_boundaries(LAT, LON, now)
    assert any(
        i.name == "Blue hour starts"
        and i.group == "blue_morning"
        and local(i.target_ts).date().isoformat() == "2026-11-06"
        for i in items
    )


def test_dst_days():
    for now in (ts(2027, 4, 3, 12), ts(2027, 10, 2, 12)):
        items = sun_boundaries(LAT, LON, now)
        stamps = [i.target_ts for i in items]
        assert stamps == sorted(stamps)
        for i in items:
            if i.group == "golden_evening" and i.verb == "starts":
                lt = local(i.target_ts)
                assert 16 <= lt.hour + lt.minute / 60 <= 20.5


def test_stable_ids(frozen_now):
    a = {i.id for i in sun_boundaries(LAT, LON, frozen_now)}
    b = {i.id for i in sun_boundaries(LAT, LON, frozen_now + 10)}
    assert a == b


def test_times_are_whole_minutes():
    from shinigami.providers.sun import sun_boundaries

    items = sun_boundaries(LAT, LON, 1793900000.0)
    assert items and all(i.target_ts % 60 == 0 for i in items)


def test_provider_output_is_cell_level_not_point_level():
    # Two points ~3 km apart in the same 0.1° cell must yield identical items, so the
    # times sent to the client cannot be inverted back to an exact (home) point.
    from shinigami.providers.sun import SunProvider

    now = 1793900000.0
    a = SunProvider().query(None, -37.8136, 144.9631, now)  # type: ignore[arg-type]
    b = SunProvider().query(None, -37.7900, 144.9800, now)  # type: ignore[arg-type]
    assert [(i.id, i.target_ts) for i in a.items] == [(i.id, i.target_ts) for i in b.items]
