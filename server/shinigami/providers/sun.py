"""Golden / blue hour boundaries, computed locally with astral (no network)."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from astral import LocationInfo, SunDirection
from astral.sun import blue_hour, golden_hour

from shinigami.geo import snap_cell
from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer

TZ = ZoneInfo("Australia/Melbourne")
HORIZON_S = 36 * 3600


def sun_boundaries(lat: float, lon: float, now: float, horizon_s: int = HORIZON_S) -> list[Item]:
    observer = LocationInfo("here", "AU", "Australia/Melbourne", lat, lon).observer
    today = datetime.fromtimestamp(now, TZ).date()
    items: dict[str, Item] = {}
    kinds = (
        ("golden", golden_hour, "sun -4° to +6°"),
        ("blue", blue_hour, "sun -8° to -4°"),
    )
    for delta in (-1, 0, 1):
        d = today + timedelta(days=delta)
        for label, fn, definition in kinds:
            for direction, part in (
                (SunDirection.RISING, "morning"),
                (SunDirection.SETTING, "evening"),
            ):
                try:
                    start, end = fn(observer, d, direction, tzinfo=TZ)
                except ValueError:
                    continue
                group = f"{label}_{part}"
                for verb, when in (("starts", start), ("ends", end)):
                    # Whole minutes: sub-second times computed for one exact point could be
                    # inverted back to that point (privacy; see query()).
                    when = (when + timedelta(seconds=30)).replace(second=0, microsecond=0)
                    iid = f"sun:{group}:{verb}:{when.astimezone(TZ).date().isoformat()}"
                    items[iid] = Item(
                        id=iid,
                        layer="sun",
                        group=group,
                        name=f"{label.capitalize()} hour {verb}",
                        verb=verb,
                        target_ts=when.timestamp(),
                        kind="environment",
                        severity=0,
                        detail={"definition": definition},
                        fetched_at=now,
                        stale_after_s=None,
                        computed=True,
                    )
    out = [i for i in items.values() if now <= i.target_ts <= now + horizon_s]
    out.sort(key=lambda i: i.target_ts)
    return out


class SunProvider(Provider):
    meta = ProviderMeta(
        id="sun",
        tier="computed",
        ttl_s=3600,
        stale_after_s=None,
        attribution="Computed locally (astral)",
    )

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        # Compute for the ~10 km grid cell, never the exact point: pinned places (home)
        # must not be recoverable from the times sent to the client. Shifts times < 30 s.
        cell = snap_cell(lat, lon)
        return Layer(
            id="sun",
            status="fresh",
            rev=int(now),
            as_of=now,
            attribution=self.meta.attribution,
            items=sun_boundaries(cell.lat, cell.lon, now),
        )
