"""Nearest train/tram/bus stops near a point, read from memory (static info only)."""

from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer
from shinigami.transit.service import ATTRIBUTION, TransitService
from shinigami.transit.store import LIMITS_M, MODES

NONE_NAMES = {
    "train": "No train station within 1.5 km",
    "tram": "No tram stop within 800 m",
    "bus": "No bus stop within 500 m",
}


class TransitStopsProvider(Provider):
    meta = ProviderMeta(
        id="transit_stops",
        tier="computed",
        ttl_s=3600,
        stale_after_s=None,
        attribution=ATTRIBUTION,
        exact_location_only=True,
    )

    def __init__(self, service: TransitService) -> None:
        self.service = service

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        store = self.service.store
        if not store.loaded:
            return Layer(
                id="transit_stops",
                status="pending",
                rev=int(now),
                as_of=None,
                attribution=ATTRIBUTION,
                items=[],
            )
        # Exact providers never reach Home or camera-off places: exact_location_only plus
        # places.py/assemble.py keep them off (D-04, D-21). For a camera-enabled public saved
        # place the geoms and distance_m could be trilaterated; accepted like cameras (WR-S3).
        near = self.service.nearby(lat, lon)
        items: list[Item] = []
        for s in near.stops:
            items.append(
                Item(
                    id=f"stop:{s.id}",
                    layer="transit_stops",
                    group=s.mode,
                    name=s.name,
                    verb="",
                    target_ts=None,
                    kind="infrastructure",
                    severity=0,
                    detail={
                        "mode": s.mode,
                        "stop_id": s.id,
                        "route_type": s.route_type,
                        "distance_m": s.distance_m,
                        "walk_s": s.walk_s,
                        "routes": list(s.routes),
                    },
                    geom={"type": "Point", "coordinates": [s.lon, s.lat]},
                    fetched_at=now,
                    stale_after_s=None,
                    computed=True,
                )
            )
        for mode in MODES:
            if mode in near.none_modes:
                items.append(
                    Item(
                        id=f"none:{mode}",
                        layer="transit_stops",
                        group="none",
                        name=NONE_NAMES[mode],
                        verb="",
                        target_ts=None,
                        kind="infrastructure",
                        severity=0,
                        detail={"mode": mode, "none": True, "limit_m": LIMITS_M[mode]},
                        geom=None,
                        fetched_at=now,
                        stale_after_s=None,
                        computed=True,
                    )
                )
        order = {m: i for i, m in enumerate(MODES)}
        items.sort(key=lambda it: (order[it.detail["mode"]], it.group == "none"))
        summary = Item(
            id="transit:summary",
            layer="transit_stops",
            group="summary",
            name="transit",
            verb="",
            target_ts=None,
            kind="infrastructure",
            severity=0,
            detail={"summary": True, "ptv": self.service.ptv_state},
            geom=None,
            fetched_at=now,
            stale_after_s=None,
            computed=True,
        )
        return Layer(
            id="transit_stops",
            status="fresh",
            rev=int(now),
            as_of=store.built_at,
            attribution=ATTRIBUTION,
            items=[summary, *items],
        )
