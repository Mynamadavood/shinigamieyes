"""Nearest train/tram/bus stops near a point, read from memory (static info only)."""

import dataclasses
import logging

from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer
from shinigami.transit.model import Departure
from shinigami.transit.service import ATTRIBUTION, TransitService
from shinigami.transit.sources import direction_group
from shinigami.transit.store import LIMITS_M, MODES
from shinigami.transit.watch import StopRef

log = logging.getLogger("shinigami.transit")

STALE_AFTER_S = 120
MAX_ITEMS_PER_STOP = 30
PAST_GRACE_S = 60
_MODE_NAME = {0: "Train", 1: "Tram", 2: "Bus", 4: "Bus"}

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


def _dep_name(d: dict) -> str:
    word = _MODE_NAME.get(d["route_type"], "Bus")
    dest = d["destination"] or d["direction_name"]
    if d["route_type"] == 0:
        return f"Train to {dest}" if dest else "Train"
    num = f" {d['route_number']}" if d["route_number"] else ""
    return f"{word}{num} to {dest}" if dest else f"{word}{num}"


class TransitDeparturesProvider(Provider):
    meta = ProviderMeta(
        id="transit_departures",
        tier="polled",
        ttl_s=30,
        stale_after_s=STALE_AFTER_S,
        attribution=ATTRIBUTION,
        interval_s=30,
        exact_location_only=True,
    )

    def __init__(self, service: TransitService) -> None:
        self.service = service

    def _layer(self, now: float, status, as_of, items: list[Item]) -> Layer:
        return Layer(
            id="transit_departures",
            status=status,
            rev=int(as_of if as_of is not None else now),
            as_of=as_of,
            attribution=ATTRIBUTION,
            items=items,
        )

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        # Cache reads and bookkeeping only: PTV is never called from here (PLAT-04, D-23).
        svc = self.service
        near = svc.nearby(lat, lon)
        new = svc.watch.touch([StopRef(s.id, s.route_type) for s in near.stops], now)
        if svc.client is None:
            return self._layer(now, "pending", None, [])
        cached = {s.id: svc.cached_departures(ctx, s.id) for s in near.stops}
        new_ids = {r.stop_id for r in new}
        if any(cached[i] is None for i in new_ids if i in cached) and ctx.runtime is not None:
            try:
                ctx.runtime.nudge("transit_departures")
            except Exception as exc:  # noqa: BLE001
                log.warning("nudge failed provider=transit_departures err=%s", type(exc).__name__)
        if not near.stops:
            return self._layer(now, "fresh", now, [])
        have = [c for c in cached.values() if c is not None]
        if not have:
            return self._layer(now, "pending", None, [])
        oldest = min(f for _, f in have)
        items: list[Item] = []
        for s in near.stops:
            c = cached[s.id]
            if c is None:
                continue
            items.extend(self._stop_items(s, c[0], c[1], now))
        status = "stale" if now - oldest > STALE_AFTER_S else "fresh"
        return self._layer(now, status, oldest, items)

    def _stop_items(self, s, payload: dict, fetched_at: float, now: float) -> list[Item]:
        rows = []
        for d in payload.get("departures") or []:
            target = d["estimated_ts"] if d["estimated_ts"] is not None else d["scheduled_ts"]
            if target < now - PAST_GRACE_S:
                continue
            rows.append((target, d))
        rows.sort(key=lambda r: r[0])
        rows = rows[:MAX_ITEMS_PER_STOP]
        deps = [Departure(**{**d, "disruption_ids": tuple(d["disruption_ids"])}) for _, d in rows]
        groups = direction_group(s.lat, s.lon, deps, self.service.store)
        mode_word = _MODE_NAME.get(s.route_type, "Bus").lower()
        out: list[Item] = []
        seen: set[str] = set()
        for target, d in rows:
            item_id = f"dep:{s.id}:{d['run_ref']}"
            if item_id in seen:
                continue
            seen.add(item_id)
            est = d["estimated_ts"]
            out.append(
                Item(
                    id=item_id,
                    layer="transit_departures",
                    group=f"{s.id}:{groups.get(d['run_ref'], 'r?')}",
                    name=_dep_name(d),
                    verb="departs",
                    target_ts=target,
                    kind="transit_vehicle",
                    severity=0,
                    detail={
                        "live": est is not None,
                        "scheduled_ts": d["scheduled_ts"],
                        "delay_s": round(est - d["scheduled_ts"]) if est is not None else None,
                        "route_id": d["route_id"],
                        "route_number": d["route_number"],
                        "route_name": d["route_name"],
                        "route_type": d["route_type"],
                        "mode": mode_word,
                        "destination": d["destination"],
                        "direction_id": d["direction_id"],
                        "direction_name": d["direction_name"],
                        "platform": d["platform"],
                        "at_platform": d["at_platform"],
                        "walk_s": s.walk_s,
                        "stop_id": s.id,
                        "stop_name": s.name,
                        "disruption_ids": list(d["disruption_ids"]),
                        "cancelled": d["cancelled"],
                    },
                    geom=None,
                    fetched_at=fetched_at,
                    stale_after_s=STALE_AFTER_S,
                )
            )
        return out

    async def refresh(self, ctx: ProviderContext) -> None:
        svc = self.service
        if svc.source is None:
            return
        now = ctx.clock()
        refs = svc.watch.active(now)
        if not refs:
            return
        ok = 0
        last: Exception | None = None
        for ref in refs:
            try:
                res = await svc.source.departures(ref)
            except Exception as exc:  # noqa: BLE001
                last = exc
                log.warning(
                    "refresh failed provider=transit_departures err=%s kind=%s",
                    type(exc).__name__,
                    getattr(exc, "kind", "unknown"),
                )
                continue
            payload = {
                "departures": [
                    {**dataclasses.asdict(d), "disruption_ids": list(d.disruption_ids)}
                    for d in res.departures
                ],
                "positions": {
                    k: {"lat": p.lat, "lon": p.lon, "ts": p.ts} for k, p in res.positions.items()
                },
            }
            ctx.store.put_layer("transit", f"dep:{ref.stop_id}", payload, now)
            ok += 1
        if ok == 0 and last is not None:
            svc.ptv_state = "error"
            raise last
        svc.ptv_state = "ok"
        svc.last_live_ts = now
