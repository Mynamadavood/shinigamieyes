"""Grass pollen and epidemic thunderstorm asthma forecasts for Melbourne (ENV-06). Network only in refresh().

Best effort: there is no official feed, so this reads the melbournepollen.com.au home page
(AirHealth / University of Melbourne; asthma forecast from Vic Health + BOM) twice a day and
shows it to one person only, never republished. Out of season the page has no forecast and
the layer simply has no items.
shortcut: regex over the page's CSS classes; it breaks if the site is redesigned, which shows
as an error layer, not a wrong value.
"""

import re

from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer

URL = "https://www.melbournepollen.com.au/"
ATTRIBUTION = "Pollen: AirHealth / melbournepollen.com.au · Asthma: Vic Health + BOM"
STALE_AFTER_S = 18 * 3600
POLLEN_LEVELS = {"low": 0, "moderate": 1, "high": 2, "extreme": 3}
# asthma is escalated harder than pollen: even Moderate is worth a red flag
ASTHMA_LEVELS = {"low": 0, "moderate": 2, "high": 3}
_POLLEN = re.compile(r'bar-pollen-(\w+)\s*"\s*id="bar-pollen-div"')
_ASTHMA = re.compile(r'side-bar-thunderstorm-(\w+)">\s*Central\s*<')
_DATE = re.compile(r'id="pdate">\s*([^<]+?)\s*<')


def parse_pollen(html: str) -> dict:
    """{"pollen": "high"|None, "asthma": "low"|None, "date": str|None}. Unknown bands become None."""
    def pick(rx, levels):
        m = rx.search(html)
        v = m.group(1).lower() if m else None
        return v if v in levels else None

    d = _DATE.search(html)
    out = {
        "pollen": pick(_POLLEN, POLLEN_LEVELS),
        "asthma": pick(_ASTHMA, ASTHMA_LEVELS),
        "date": d.group(1) if d else None,
    }
    if "bar-pollen-div" not in html and "side-bar-thunderstorm" not in html:
        raise ValueError("page layout changed")
    return out


class PollenProvider(Provider):
    meta = ProviderMeta(
        id="pollen",
        tier="polled",
        ttl_s=10800,
        stale_after_s=STALE_AFTER_S,
        attribution=ATTRIBUTION,
        interval_s=10800,
        backoff_cap_s=10800,
    )

    async def refresh(self, ctx: ProviderContext) -> None:
        r = await ctx.http.get(URL, timeout=15)
        r.raise_for_status()
        ctx.store.put_layer("pollen", "global", parse_pollen(r.text), ctx.clock())

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        row = ctx.store.get_layer("pollen", "global") if ctx.store else None
        if row is None:
            return Layer(
                id="pollen", status="pending", rev=int(now), as_of=None,
                attribution=ATTRIBUTION, items=[],
            )
        p, fetched_at = row
        items = []
        for key, name, levels in (
            ("pollen", "Grass pollen", POLLEN_LEVELS),
            ("asthma", "Thunderstorm asthma", ASTHMA_LEVELS),
        ):
            band = p.get(key)
            if band is None:
                continue
            items.append(
                Item(
                    id=f"pollen:{key}",
                    layer="pollen",
                    group=key,
                    name=name,
                    verb="today",
                    target_ts=None,
                    kind="environment",
                    severity=levels[band],
                    detail={"display": band.capitalize(), "chip": True, "band": band,
                            "forecast_date": p.get("date")},
                    fetched_at=fetched_at,
                    stale_after_s=STALE_AFTER_S,
                )
            )
        return Layer(
            id="pollen",
            status="stale" if now - fetched_at > STALE_AFTER_S else "fresh",
            rev=int(fetched_at),
            as_of=fetched_at,
            attribution=ATTRIBUTION,
            items=items,
        )
