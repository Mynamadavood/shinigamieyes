"""Nearest train/tram/bus stops near a point, read from memory (static info only)."""

import dataclasses
import logging

from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer
from shinigami.transit.model import Departure
from shinigami.transit.service import ATTRIBUTION, TransitService
from shinigami.transit.severity import classify_disruption
from shinigami.transit.sources import direction_group
from shinigami.transit.store import LIMITS_M, MODES
from shinigami.transit.vehicles import (
    ETA_HORIZON_S,
    PATTERN_RUNS_PER_CYCLE,
    PATTERN_TTL_S,
    VEHICLE_ROUTE_TYPES,
    PtvInterpolatedSource,
    PtvRunPositionSource,
    run_key,
    select_vehicles,
)
from shinigami.transit.watch import StopRef

log = logging.getLogger("shinigami.transit")

STALE_AFTER_S = 120
MAX_ITEMS_PER_STOP = 30
PAST_GRACE_S = 60
MAX_DISRUPTIONS = 6
PLANNED_WINDOW_S = 86_400
DIS_STALE_AFTER_S = 600
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
        svc.last_new_refs = set(new_ids)
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
        # Vehicles are derived from these departures, so tell open streams to re-read them.
        if ctx.bus is not None:
            ctx.bus.publish({"type": "touch", "provider": "transit_vehicles"})


class TransitDisruptionsProvider(Provider):
    meta = ProviderMeta(
        id="transit_disruptions",
        tier="polled",
        ttl_s=300,
        stale_after_s=DIS_STALE_AFTER_S,
        attribution=ATTRIBUTION,
        interval_s=300,
        exact_location_only=True,
    )

    def __init__(self, service: TransitService) -> None:
        self.service = service

    def _layer(self, now: float, status, as_of, items: list[Item]) -> Layer:
        return Layer(
            id="transit_disruptions",
            status=status,
            rev=int(as_of if as_of is not None else now),
            as_of=as_of,
            attribution=ATTRIBUTION,
            items=items,
        )

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        # Cache reads only: PTV is never called from here (PLAT-04).
        svc = self.service
        near = svc.nearby(lat, lon)
        if svc.client is None:
            return self._layer(now, "pending", None, [])
        stop_ids = {s.id for s in near.stops}
        route_ids: set[int] = set()
        have_deps = False
        for sid in stop_ids:
            c = svc.cached_departures(ctx, sid)
            if c is None:
                continue
            have_deps = True
            for d in c[0].get("departures") or []:
                rid = d.get("route_id")
                if isinstance(rid, int):
                    route_ids.add(rid)
        cache = svc.cached_disruptions(ctx)
        if ctx.runtime is not None and (
            (stop_ids & svc.last_new_refs) or (cache is None and have_deps)
        ):
            try:
                ctx.runtime.nudge("transit_disruptions")
            except Exception as exc:  # noqa: BLE001
                log.warning("nudge failed provider=transit_disruptions err=%s", type(exc).__name__)
        if not stop_ids:
            return self._layer(now, "fresh", now, [])
        if cache is None or not have_deps:
            return self._layer(now, "pending", None, [])
        payload, fetched_at = cache
        rows = []
        for d in payload.get("disruptions") or []:
            if not (route_ids & set(d["route_ids"]) or stop_ids & set(d["stop_ids"])):
                continue
            to_ts, from_ts = d.get("to_ts"), d.get("from_ts")
            if to_ts is not None and to_ts < now:
                continue
            if d.get("status") == "Planned" and (
                from_ts is None or from_ts > now + PLANNED_WINDOW_S
            ):
                continue
            sev = classify_disruption(d.get("dtype"), d.get("title"), d.get("description"))
            rows.append((sev, d))
        rows.sort(
            key=lambda r: (
                -r[0],
                r[1]["to_ts"] if r[1].get("to_ts") is not None else float("inf"),
                -(r[1].get("updated_ts") or 0.0),
            )
        )
        items: list[Item] = []
        for sev, d in rows[:MAX_DISRUPTIONS]:
            title = (d.get("title") or "")[:160]
            items.append(
                Item(
                    id=f"dis:{d['id']}",
                    layer="transit_disruptions",
                    group="disruption",
                    name=title,
                    verb="ends",
                    target_ts=d.get("to_ts"),
                    kind="infrastructure",
                    severity=sev,
                    detail={
                        "disruption_id": d["id"],
                        "title": title,
                        "description": (d.get("description") or "")[:400],
                        "status": d.get("status"),
                        "updated_ts": d.get("updated_ts"),
                        "from_ts": d.get("from_ts"),
                        "to_ts": d.get("to_ts"),
                        "route_ids": list(d["route_ids"]),
                        "route_labels": list(d["route_labels"]),
                        "stop_ids": list(d["stop_ids"]),
                        "stop_names": list(d["stop_names"]),
                        "modes": list(d["modes"]),
                        "service_stopped": sev == 3,
                    },
                    geom=None,
                    fetched_at=fetched_at,
                    stale_after_s=DIS_STALE_AFTER_S,
                )
            )
        status = "stale" if now - fetched_at > DIS_STALE_AFTER_S else "fresh"
        return self._layer(now, status, fetched_at, items)

    async def refresh(self, ctx: ProviderContext) -> None:
        svc = self.service
        if svc.client is None:
            return
        now = ctx.clock()
        if not svc.watch.active(now):
            return
        try:
            found = await svc.client.disruptions()
        except Exception as exc:
            log.warning(
                "refresh failed provider=transit_disruptions err=%s kind=%s",
                type(exc).__name__,
                getattr(exc, "kind", "unknown"),
            )
            raise
        payload = {
            "disruptions": [
                {
                    "id": d.id, "title": d.title, "description": d.description,
                    "status": d.status, "dtype": d.dtype, "updated_ts": d.updated_ts,
                    "from_ts": d.from_ts, "to_ts": d.to_ts, "route_ids": list(d.route_ids),
                    "route_labels": list(d.route_labels), "stop_ids": list(d.stop_ids),
                    "stop_names": list(d.stop_names), "modes": sorted(d.modes),
                }
                for d in found
            ]
        }  # fmt: skip
        ctx.store.put_layer("transit", "disruptions", payload, now)


VEH_STALE_AFTER_S = 120
PATTERN_ETA_WINDOW_S = 1200
# A pattern older than this cannot place a vehicle inside the ETA horizon any more.
PATTERN_KEEP_S = 2 * ETA_HORIZON_S


class TransitVehiclesProvider(Provider):
    meta = ProviderMeta(
        id="transit_vehicles",
        tier="polled",
        ttl_s=30,
        stale_after_s=VEH_STALE_AFTER_S,
        attribution=ATTRIBUTION,
        interval_s=30,
        exact_location_only=True,
    )

    def __init__(self, service: TransitService) -> None:
        self.service = service
        self.sources = (PtvRunPositionSource(), PtvInterpolatedSource())

    def _layer(self, now: float, status, as_of, items: list[Item]) -> Layer:
        return Layer(
            id="transit_vehicles",
            status=status,
            rev=int(as_of if as_of is not None else now),
            as_of=as_of,
            attribution=ATTRIBUTION,
            items=items,
        )

    def query(self, ctx: ProviderContext, lat: float, lon: float, now: float) -> Layer:
        # Cache reads only: PTV is never called from here (PLAT-04).
        svc = self.service
        if svc.client is None:
            return self._layer(now, "pending", None, [])
        near = svc.nearby(lat, lon)
        stops = list(near.stops)
        if not stops:
            return self._layer(now, "fresh", now, [])
        cached = {s.id: svc.cached_departures(ctx, s.id) for s in stops}
        have = [c for c in cached.values() if c is not None]
        if not have:
            return self._layer(now, "pending", None, [])
        oldest = min(f for _, f in have)

        def cache(k):
            if isinstance(k, int):
                c = cached.get(k)
            else:
                c = ctx.store.get_layer("transit", f"pat:{k}") if ctx.store is not None else None
            return c[0] if c is not None else None

        cands = []
        for src in self.sources:
            cands.extend(src.vehicles(stops, cache, now))
        items: list[Item] = []
        for v in select_vehicles(cands, stops, now):
            word = _MODE_NAME.get(v.route_type, "Bus")
            num = f" {v.route_number}" if v.route_number else ""
            name = f"{word}{num} to {v.destination}" if v.destination else f"{word}{num}"
            items.append(
                Item(
                    id=f"veh:{v.key}",
                    layer="transit_vehicles",
                    group=word.lower(),
                    name=name,
                    verb="arrives",
                    target_ts=v.eta_ts,
                    kind="transit_vehicle",
                    severity=0,
                    detail={
                        "route_number": v.route_number,
                        "route_type": v.route_type,
                        "mode": word.lower(),
                        "destination": v.destination,
                        "heading_stop_id": v.heading_stop_id,
                        "heading_stop_name": v.heading_stop_name,
                        "eta_ts": v.eta_ts,
                        "eta_live": v.eta_live,
                        "pos_ts": v.pos_ts,
                        "pos_src": v.pos_src,
                    },
                    geom={"type": "Point", "coordinates": [v.lon, v.lat]},
                    fetched_at=oldest,
                    stale_after_s=VEH_STALE_AFTER_S,
                )
            )
        status = "stale" if now - oldest > VEH_STALE_AFTER_S else "fresh"
        return self._layer(now, status, oldest, items)

    def _pattern_targets(
        self, ctx: ProviderContext, refs, now: float
    ) -> list[tuple[str, int, str]]:
        """Soonest tram/bus run per route-direction with no real position and no fresh pattern.

        At most PATTERN_RUNS_PER_CYCLE; returns (run_ref, route_type, key).
        """
        svc = self.service
        best: dict[tuple, tuple[float, str, int]] = {}
        for ref in refs:
            c = svc.cached_departures(ctx, ref.stop_id)
            if c is None:
                continue
            positions = c[0].get("positions") or {}
            for d in c[0].get("departures") or []:
                if d.get("cancelled") or d.get("route_type") not in VEHICLE_ROUTE_TYPES:
                    continue
                if positions.get(d["run_ref"]):
                    continue
                eta = d["estimated_ts"] if d["estimated_ts"] is not None else d["scheduled_ts"]
                if not now <= eta <= now + min(PATTERN_ETA_WINDOW_S, ETA_HORIZON_S):
                    continue
                gk = (d["route_id"], d["direction_id"])
                if gk not in best or eta < best[gk][0]:
                    best[gk] = (eta, d["run_ref"], d["route_type"])
        out: list[tuple[str, int, str]] = []
        seen: set[str] = set()
        for _eta, run_ref, rt in sorted(best.values(), key=lambda v: v[0]):
            key = run_key(run_ref)
            if key in seen:
                continue
            seen.add(key)
            prev = ctx.store.get_layer("transit", f"pat:{key}")
            if prev is not None and now - prev[1] < PATTERN_TTL_S:
                continue
            out.append((run_ref, rt, key))
            if len(out) >= PATTERN_RUNS_PER_CYCLE:
                break
        return out

    async def refresh(self, ctx: ProviderContext) -> None:
        svc = self.service
        if svc.client is None:
            return
        now = ctx.clock()
        # Pattern cells are keyed per run, so the key space never repeats: drop old ones every
        # cycle (even with an empty watch set) to keep RAM and SQLite bounded (review CR-S1).
        ctx.store.prune_layers("transit", "pat:", now - PATTERN_KEEP_S)
        refs = svc.watch.active(now)
        if not refs:
            return
        attempted = 0
        ok = 0
        last: Exception | None = None
        for run_ref, rt, key in self._pattern_targets(ctx, refs, now):
            attempted += 1
            try:
                pattern = await svc.client.pattern(run_ref, rt)
            except Exception as exc:  # noqa: BLE001
                last = exc
                log.warning(
                    "refresh failed provider=transit_vehicles err=%s kind=%s",
                    type(exc).__name__,
                    getattr(exc, "kind", "unknown"),
                )
                continue
            ctx.store.put_layer(
                "transit", f"pat:{key}", {"stops": [dataclasses.asdict(p) for p in pattern]}, now
            )
            ok += 1
        if attempted and ok == 0 and last is not None:
            raise last
