"""ARPANSA live UV index (Melbourne station). Network only in refresh()."""

import xml.etree.ElementTree as ET
from datetime import UTC, datetime

from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer

URL = "https://uvdata.arpansa.gov.au/xml/uvvalues.xml"
STATION = "Melbourne"
STALE_AFTER_S = 1800


def parse_arpansa(content: bytes, station: str = STATION) -> tuple[float, float, str]:
    """Parse bytes (handles the UTF-8 BOM). Returns (index, utc_epoch, status)."""
    root = ET.fromstring(content)
    loc = next((x for x in root.iter("location") if x.get("id") == station), None)
    if loc is None:
        raise ValueError("station missing")
    status = (loc.findtext("status") or "").strip().lower()
    if status != "ok":
        raise ValueError("station not ok")
    idx = float(loc.findtext("index"))
    stamp = (loc.findtext("utcdatetime") or "").strip()
    ts = datetime.strptime(stamp, "%Y/%m/%d %H:%M").replace(tzinfo=UTC)
    return idx, ts.timestamp(), status


def band(index: float) -> str:
    if index < 3:
        return "Low"
    if index < 6:
        return "Moderate"
    if index < 8:
        return "High"
    if index < 11:
        return "Very high"
    return "Extreme"


class ArpansaUvProvider(Provider):
    meta = ProviderMeta(
        id="uv_now",
        tier="polled",
        ttl_s=300,
        stale_after_s=STALE_AFTER_S,
        attribution="UV data courtesy of ARPANSA",
        interval_s=300,
    )

    async def refresh(self, ctx: ProviderContext) -> None:
        r = await ctx.http.get(URL, timeout=10)
        r.raise_for_status()
        idx, utc_ts, _ = parse_arpansa(r.content)
        ctx.store.put_layer(
            "uv_now", "global", {"index": idx, "utc_ts": utc_ts, "station": STATION}, utc_ts
        )

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        row = ctx.store.get_layer("uv_now", "global") if ctx.store else None
        if row is None:
            return Layer(
                id="uv_now",
                status="pending",
                rev=int(now),
                as_of=None,
                attribution=self.meta.attribution,
                items=[],
            )
        payload, _ = row
        ts = float(payload["utc_ts"])
        idx = float(payload["index"])
        item = Item(
            id="uv_now:melbourne",
            layer="uv_now",
            group="uv_now",
            name="UV index now",
            verb="now",
            target_ts=None,
            kind="environment",
            severity=0,
            detail={"display": f"{idx:g} · {band(idx)}", "index": idx, "station": STATION},
            fetched_at=ts,
            stale_after_s=STALE_AFTER_S,
        )
        stale = now - ts > STALE_AFTER_S
        return Layer(
            id="uv_now",
            status="stale" if stale else "fresh",
            rev=int(ts),
            as_of=ts,
            attribution=self.meta.attribution,
            items=[item],
        )
