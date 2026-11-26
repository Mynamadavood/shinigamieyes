"""Current weather and the rain countdown from Open-Meteo, per 0.1 degree cell (ENV-01, ENV-02).

Network only in fetch_cell(). Only the snapped cell centre is sent upstream.
shortcut: Open-Meteo only, no BOM; add the unofficial BOM API if its nowcast proves better.
"""

from shinigami.geo import Cell, snap_cell
from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer

URL = "https://api.open-meteo.com/v1/forecast"
ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)"
TTL_S = 900
STALE_AFTER_S = 3600
SLOTS = 24  # 6 h of 15-minute steps
SLOT_S = 900
WET_MM = 0.1  # per 15 minutes; below this it counts as dry
# ENV-02 link-out: BOM's Melbourne 128 km radar loop (an overlay would need the FTP frames)
RADAR_URL = "https://www.bom.gov.au/products/IDR023.loop.shtml"

WMO = {
    0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain",
    65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Snow", 73: "Snow",
    75: "Snow", 77: "Snow", 80: "Showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm, hail",
    99: "Thunderstorm, hail",
}


def rain_change(times: list[float], mm: list[float], now: float):
    """(wet_now, epoch of the first slot where that flips) over the slots covering now onwards.

    The flip time is None when nothing changes inside the forecast. Returns None with no slots.
    """
    slots = [(t, m) for t, m in zip(times, mm, strict=False) if t + SLOT_S > now and m is not None]
    if not slots:
        return None
    wet_now = slots[0][1] >= WET_MM
    for t, m in slots[1:]:
        if (m >= WET_MM) != wet_now:
            return wet_now, float(t)
    return wet_now, None


class WeatherProvider(Provider):
    meta = ProviderMeta(
        id="weather",
        tier="on_demand",
        ttl_s=TTL_S,
        stale_after_s=STALE_AFTER_S,
        attribution=ATTRIBUTION,
    )

    async def fetch_cell(self, ctx: ProviderContext, cell: Cell) -> None:
        params = {
            "latitude": cell.lat,
            "longitude": cell.lon,
            "current": "temperature_2m,apparent_temperature,weather_code,precipitation",
            "minutely_15": "precipitation",
            "forecast_minutely_15": SLOTS,
            "timezone": "UTC",
            "timeformat": "unixtime",
        }
        r = await ctx.http.get(URL, params=params, timeout=10)
        r.raise_for_status()
        j = r.json()
        cur, m15 = j["current"], j["minutely_15"]
        payload = {
            "temp": float(cur["temperature_2m"]),
            "feels": float(cur["apparent_temperature"]),
            "code": int(cur["weather_code"]),
            "times": [float(t) for t in m15["time"]],
            "mm": m15["precipitation"],
        }
        ctx.store.put_layer("weather", cell.id, payload, ctx.clock())

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        cell = snap_cell(lat, lon)
        row = ctx.store.get_layer("weather", cell.id) if ctx.store else None
        if row is None:
            return Layer(
                id="weather", status="pending", rev=int(now), as_of=None,
                attribution=ATTRIBUTION, items=[],
            )
        p, fetched_at = row
        label = WMO.get(int(p["code"]), "Weather")
        common = {"layer": "weather", "kind": "environment", "fetched_at": fetched_at}
        items = [
            Item(
                id="weather:now",
                group="weather_now",
                name="Weather",
                verb="now",
                target_ts=None,
                severity=0,
                detail={
                    "display": f"{round(p['temp'])}° · {label}",
                    "chip": True,
                    "label": label,
                    "temp": p["temp"],
                    "feels": p["feels"],
                    "link": RADAR_URL,
                },
                stale_after_s=STALE_AFTER_S,
                **common,
            )
        ]
        change = rain_change(p["times"], p["mm"], now)
        if change is not None:
            wet_now, flip = change
            verb = "ends" if wet_now else "starts"
            items.append(
                Item(
                    id=f"weather:rain:{verb}",
                    group="rain",
                    name=f"Rain {verb}",
                    verb=verb,
                    target_ts=flip,
                    severity=0,
                    detail={
                        "approx": True,
                        # value-only when nothing changes inside the 6 h forecast
                        "display": None if flip else ("raining, 6 h+" if wet_now else "dry next 6 h"),
                    },
                    stale_after_s=STALE_AFTER_S,
                    **common,
                )
            )
        return Layer(
            id="weather",
            status="stale" if now - fetched_at > TTL_S * 2 else "fresh",
            rev=int(fetched_at),
            as_of=fetched_at,
            attribution=ATTRIBUTION,
            items=items,
        )
