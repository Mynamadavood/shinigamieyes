"""UV protection window (clear-sky UV >= 3) from Open-Meteo, per 0.1 degree cell.

Network only in fetch_cell(). Only the snapped cell centre is sent upstream.
Fallback when Open-Meteo is down: sun elevation crossing 20 degrees, flagged estimated.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from astral import LocationInfo
from astral.sun import SunDirection, time_at_elevation

from shinigami.geo import Cell, snap_cell
from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer

URL = "https://api.open-meteo.com/v1/forecast"
THRESHOLD = 3.0
FALLBACK_ELEVATION = 20.0  # [ASSUMED] RESEARCH A4
HORIZON_S = 36 * 3600
TTL_S = 10800
ESTIMATE_RETRY_S = 600
TZ = ZoneInfo("Australia/Melbourne")
ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)"
ESTIMATE_ATTRIBUTION = "Estimated from sun elevation (Open-Meteo unavailable)"

NAMES = {"starts": "UV protection starts", "until": "UV protection until"}


def uv_boundaries(times: list[float], uv: list[float], thr: float = THRESHOLD):
    """Linear-interpolated crossings of thr. Returns [("starts"|"ends", epoch), ...]."""
    out = []
    for (t0, a), (t1, b) in zip(zip(times, uv, strict=False), zip(times[1:], uv[1:], strict=False)):
        if (a < thr) != (b < thr):
            t = t0 + (thr - a) / (b - a) * (t1 - t0)
            out.append(("starts" if b >= thr else "ends", t))
    return out


def estimate_boundaries(lat: float, lon: float, now: float):
    observer = LocationInfo("here", "AU", "Australia/Melbourne", lat, lon).observer
    today = datetime.fromtimestamp(now, TZ).date()
    out = []
    for delta in (-1, 0, 1, 2):
        d = today + timedelta(days=delta)
        for direction, verb in ((SunDirection.RISING, "starts"), (SunDirection.SETTING, "ends")):
            try:
                t = time_at_elevation(observer, FALLBACK_ELEVATION, d, direction, tzinfo=TZ)
            except ValueError:
                continue
            out.append((verb, t.timestamp()))
    out.sort(key=lambda b: b[1])
    return out


class UvWindowProvider(Provider):
    meta = ProviderMeta(
        id="uv_window",
        tier="on_demand",
        ttl_s=TTL_S,
        stale_after_s=21600,
        attribution=ATTRIBUTION,
    )

    async def fetch_cell(self, ctx: ProviderContext, cell: Cell) -> None:
        params = {
            "latitude": cell.lat,
            "longitude": cell.lon,
            "hourly": "uv_index_clear_sky",
            "timezone": "UTC",
            "timeformat": "unixtime",
            "forecast_days": 3,
        }
        try:
            r = await ctx.http.get(URL, params=params, timeout=10)
            r.raise_for_status()
            hourly = r.json()["hourly"]
            bounds = uv_boundaries(hourly["time"], hourly["uv_index_clear_sky"])
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            if ctx.store.get_layer("uv_window", cell.id) is None:
                now = ctx.clock()
                ctx.store.put_layer(
                    "uv_window",
                    cell.id,
                    {
                        "boundaries": [list(b) for b in estimate_boundaries(cell.lat, cell.lon, now)],
                        "estimated": True,
                    },
                    now,
                )
            raise
        ctx.store.put_layer(
            "uv_window",
            cell.id,
            {"boundaries": [list(b) for b in bounds], "estimated": False},
            ctx.clock(),
        )

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        cell = snap_cell(lat, lon)
        row = ctx.store.get_layer("uv_window", cell.id) if ctx.store else None
        if row is None:
            return Layer(
                id="uv_window",
                status="pending",
                rev=int(now),
                as_of=None,
                attribution=ATTRIBUTION,
                items=[],
            )
        payload, fetched_at = row
        estimated = bool(payload.get("estimated"))
        age = now - fetched_at
        stale = age > (ESTIMATE_RETRY_S if estimated else TTL_S)
        items = []
        for verb_raw, t in payload["boundaries"]:
            if not (now <= t <= now + HORIZON_S):
                continue
            verb = "until" if verb_raw in ("ends", "until") else "starts"
            local_date = datetime.fromtimestamp(t, TZ).date().isoformat()
            items.append(
                Item(
                    id=f"uv_window:{verb}:{local_date}",
                    layer="uv_window",
                    group="uv_window",
                    name=NAMES[verb],
                    verb=verb,
                    target_ts=float(t),
                    kind="environment",
                    severity=0,
                    detail={
                        "approx": True,
                        "basis": "clear-sky UV ≥ 3",
                        "estimated": estimated,
                    },
                    fetched_at=fetched_at,
                    stale_after_s=21600,
                )
            )
        items.sort(key=lambda i: i.target_ts)
        return Layer(
            id="uv_window",
            status="stale" if stale else "fresh",
            rev=int(fetched_at),
            as_of=fetched_at,
            attribution=ESTIMATE_ATTRIBUTION if estimated else ATTRIBUTION,
            items=items,
        )
