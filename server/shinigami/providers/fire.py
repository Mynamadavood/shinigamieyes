"""CFA fire danger rating and Total Fire Ban for the Central district (ENV-05). Network only in refresh().

shortcut: Central district only (all of Greater Melbourne); map cells to districts if the app
is used out in the regions.
"""

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from zoneinfo import ZoneInfo

from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer

URL = "https://www.cfa.vic.gov.au/cfa/rssfeed/central-firedistrict_rss.xml"
DISTRICT = "Central"
ATTRIBUTION = "Fire danger ratings: CFA / Bureau of Meteorology"
STALE_AFTER_S = 6 * 3600
TZ = ZoneInfo("Australia/Melbourne")
# AFDRS rating -> chip level 0..3
LEVELS = {"NO RATING": 0, "MODERATE": 1, "HIGH": 2, "EXTREME": 3, "CATASTROPHIC": 3}
_RATING = re.compile(rf"{DISTRICT}:\s*([A-Za-z ]+?)\s*<", re.IGNORECASE)


def parse_cfa(content: bytes) -> dict[str, dict]:
    """{local ISO date: {"rating": "HIGH", "tfb": bool}} for each forecast day in the feed."""
    days = {}
    for item in ET.fromstring(content).iter("item"):
        title = (item.findtext("title") or "").strip()
        desc = item.findtext("description") or ""
        try:
            day = datetime.strptime(title, "%A, %d %B %Y").date().isoformat()
        except ValueError:
            continue
        m = _RATING.search(desc)
        rating = m.group(1).strip().upper() if m else "NO RATING"
        low = desc.lower()
        tfb = "total fire ban" in low and "not currently a day of total fire ban" not in low
        days[day] = {"rating": rating if rating in LEVELS else "NO RATING", "tfb": tfb}
    if not days:
        raise ValueError("no forecast days")
    return days


class FireDangerProvider(Provider):
    meta = ProviderMeta(
        id="fire_danger",
        tier="polled",
        ttl_s=1800,
        stale_after_s=STALE_AFTER_S,
        attribution=ATTRIBUTION,
        interval_s=1800,
    )

    async def refresh(self, ctx: ProviderContext) -> None:
        r = await ctx.http.get(URL, timeout=10)
        r.raise_for_status()
        ctx.store.put_layer("fire_danger", "global", {"days": parse_cfa(r.content)}, ctx.clock())

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        row = ctx.store.get_layer("fire_danger", "global") if ctx.store else None
        today = datetime.fromtimestamp(now, TZ).date().isoformat()
        day = row[0]["days"].get(today) if row else None
        if day is None:  # nothing fetched yet, or the feed has rolled past its last day
            return Layer(
                id="fire_danger", status="pending", rev=int(now), as_of=None,
                attribution=ATTRIBUTION, items=[],
            )
        fetched_at = row[1]
        rating, tfb = day["rating"], bool(day["tfb"])
        level = 3 if tfb else LEVELS[rating]
        display = rating.capitalize() + (" · Total Fire Ban" if tfb else "")
        item = Item(
            id=f"fire_danger:{today}",
            layer="fire_danger",
            group="fire_danger",
            name="Fire danger",
            verb="today",
            target_ts=None,
            kind="environment",
            severity=level,
            detail={"display": display, "chip": True, "rating": rating, "tfb": tfb,
                    "district": DISTRICT},
            fetched_at=fetched_at,
            stale_after_s=STALE_AFTER_S,
        )
        return Layer(
            id="fire_danger",
            status="stale" if now - fetched_at > STALE_AFTER_S else "fresh",
            rev=int(fetched_at),
            as_of=fetched_at,
            attribution=ATTRIBUTION,
            items=[item],
        )
