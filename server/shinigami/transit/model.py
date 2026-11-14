"""Source-neutral transit records and tolerant PTV v3 parsers (D-18, D-20).

Privacy: PTV `vehicle_descriptor` (operator, vehicle id) is deliberately NOT modelled so it is
dropped at the parser. Nothing here identifies a vehicle or a driver.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from pydantic import BaseModel, ConfigDict

MAX_DEPARTURES = 60
_DISRUPTION_CATEGORIES = ("general", "metro_train", "metro_tram", "metro_bus", "night_bus")
_MODE_WORDS = {0: "Train", 1: "Tram", 2: "Bus", 4: "Bus"}


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class PtvDeparture(_Loose):
    stop_id: int | None = None
    route_id: int | None = None
    run_ref: str | None = None
    direction_id: int | None = None
    scheduled_departure_utc: str | None = None
    estimated_departure_utc: str | None = None
    at_platform: bool | None = None
    platform_number: str | None = None
    disruption_ids: list[int] | None = None


class PtvVehiclePosition(_Loose):
    latitude: float | None = None
    longitude: float | None = None
    datetime_utc: str | None = None


class PtvRun(_Loose):
    # vehicle_descriptor is intentionally omitted: operator / vehicle ids are dropped (D-18).
    run_ref: str | None = None
    route_id: int | None = None
    route_type: int | None = None
    final_stop_id: int | None = None
    destination_name: str | None = None
    status: str | None = None
    direction_id: int | None = None
    vehicle_position: PtvVehiclePosition | None = None


class PtvRoute(_Loose):
    route_id: int | None = None
    route_type: int | None = None
    route_name: str | None = None
    route_number: str | None = None


class PtvDirection(_Loose):
    direction_id: int | None = None
    direction_name: str | None = None


class PtvStopRef(_Loose):
    stop_id: int | None = None
    stop_name: str | None = None
    stop_latitude: float | None = None
    stop_longitude: float | None = None


class PtvDisruptionRoute(_Loose):
    route_type: int | None = None
    route_id: int | None = None
    route_name: str | None = None
    route_number: str | None = None


class PtvDisruption(_Loose):
    disruption_id: int | None = None
    title: str | None = None
    description: str | None = None
    disruption_status: str | None = None
    disruption_type: str | None = None
    last_updated: str | None = None
    from_date: str | None = None
    to_date: str | None = None
    routes: list[PtvDisruptionRoute] | None = None
    stops: list[PtvStopRef] | None = None


@dataclass(frozen=True)
class Departure:
    stop_id: int
    route_id: int
    route_type: int
    route_number: str
    route_name: str
    run_ref: str
    direction_id: int | None
    direction_name: str
    destination: str
    final_stop_id: int | None
    scheduled_ts: float
    estimated_ts: float | None
    platform: str | None
    at_platform: bool
    cancelled: bool
    disruption_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class RunPosition:
    run_ref: str
    lat: float
    lon: float
    ts: float | None


@dataclass(frozen=True)
class StopDepartures:
    departures: tuple[Departure, ...] = ()
    positions: dict[str, RunPosition] = field(default_factory=dict)


@dataclass(frozen=True)
class PatternStop:
    stop_id: int
    lat: float
    lon: float
    ts: float


@dataclass(frozen=True)
class Disruption:
    id: int
    title: str
    description: str
    status: str
    dtype: str
    updated_ts: float | None
    from_ts: float | None
    to_ts: float | None
    route_ids: tuple[int, ...]
    route_labels: tuple[str, ...]
    stop_ids: tuple[int, ...]
    stop_names: tuple[str, ...]
    modes: frozenset[str]


@dataclass(frozen=True)
class Vehicle:
    key: str
    route_number: str
    route_type: int
    destination: str
    heading_stop_id: int | None
    heading_stop_name: str
    eta_ts: float | None
    eta_live: bool
    lat: float | None
    lon: float | None
    pos_ts: float | None
    pos_src: str


def ts(s: str | None) -> float | None:
    """ISO 8601 (trailing Z ok) to epoch seconds; None for empty or unparseable."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).timestamp()
    except (ValueError, TypeError):
        return None


def _map(js: dict, name: str, model: type[BaseModel]) -> dict:
    out: dict = {}
    raw = js.get(name)
    if not isinstance(raw, dict):
        return out
    for k, v in raw.items():
        try:
            out[str(k)] = model.model_validate(v)
        except Exception:  # noqa: BLE001, S112 - tolerant: a bad entry is skipped
            continue
    return out


def parse_departures(js: dict, route_type: int) -> StopDepartures:
    runs = _map(js, "runs", PtvRun)
    routes = _map(js, "routes", PtvRoute)
    dirs = _map(js, "directions", PtvDirection)
    rows = js.get("departures")
    deps: list[Departure] = []
    positions: dict[str, RunPosition] = {}
    for raw in rows if isinstance(rows, list) else []:
        if len(deps) >= MAX_DEPARTURES:
            break
        try:
            d = PtvDeparture.model_validate(raw)
            sched = ts(d.scheduled_departure_utc)
            if d.stop_id is None or d.route_id is None or not d.run_ref or sched is None:
                continue
            run = runs.get(d.run_ref) or PtvRun()
            route = routes.get(str(d.route_id)) or PtvRoute()
            direction = dirs.get(str(d.direction_id)) if d.direction_id is not None else None
            deps.append(
                Departure(
                    stop_id=d.stop_id,
                    route_id=d.route_id,
                    route_type=run.route_type if run.route_type is not None else route_type,
                    route_number=route.route_number or "",
                    route_name=route.route_name or "",
                    run_ref=d.run_ref,
                    direction_id=d.direction_id,
                    direction_name=(direction.direction_name if direction else None) or "",
                    destination=run.destination_name or "",
                    final_stop_id=run.final_stop_id,
                    scheduled_ts=sched,
                    estimated_ts=ts(d.estimated_departure_utc),
                    platform=d.platform_number or None,
                    at_platform=bool(d.at_platform),
                    cancelled=(run.status or "").lower() == "cancelled",
                    disruption_ids=tuple(d.disruption_ids or ()),
                )
            )
            vp = run.vehicle_position
            if (
                vp is not None
                and vp.latitude
                and vp.longitude
                and d.run_ref not in positions
            ):
                positions[d.run_ref] = RunPosition(
                    d.run_ref, vp.latitude, vp.longitude, ts(vp.datetime_utc)
                )
        except Exception:  # noqa: BLE001, S112 - one bad row never fails the batch
            continue
    return StopDepartures(tuple(deps), positions)


def parse_pattern(js: dict, route_type: int) -> list[PatternStop]:
    stops = _map(js, "stops", PtvStopRef)
    rows = js.get("departures")
    out: list[PatternStop] = []
    for raw in rows if isinstance(rows, list) else []:
        try:
            d = PtvDeparture.model_validate(raw)
            if d.stop_id is None:
                continue
            st = stops.get(str(d.stop_id))
            if st is None or not st.stop_latitude or not st.stop_longitude:
                continue
            t = ts(d.estimated_departure_utc) or ts(d.scheduled_departure_utc)
            if t is None:
                continue
            out.append(PatternStop(d.stop_id, st.stop_latitude, st.stop_longitude, t))
        except Exception:  # noqa: BLE001, S112
            continue
    return out


def _label(r: PtvDisruptionRoute) -> tuple[str, str] | None:
    word = _MODE_WORDS.get(r.route_type if r.route_type is not None else -1)
    if word is None:
        return None
    if word == "Train":
        return word, f"Train · {r.route_name} line" if r.route_name else "Train"
    return word, f"{word} {r.route_number}".strip() if r.route_number else word


def parse_disruptions(js: dict) -> list[Disruption]:
    block = js.get("disruptions")
    out: list[Disruption] = []
    if not isinstance(block, dict):
        return out
    seen: set[int] = set()
    for cat in _DISRUPTION_CATEGORIES:
        rows = block.get(cat)
        for raw in rows if isinstance(rows, list) else []:
            try:
                d = PtvDisruption.model_validate(raw)
                if d.disruption_id is None or d.disruption_id in seen:
                    continue
                seen.add(d.disruption_id)
                labels: list[str] = []
                modes: set[str] = set()
                for r in d.routes or []:
                    lab = _label(r)
                    if lab:
                        modes.add(lab[0])
                        if lab[1] not in labels:
                            labels.append(lab[1])
                out.append(
                    Disruption(
                        id=d.disruption_id,
                        title=d.title or "",
                        description=d.description or "",
                        status=d.disruption_status or "",
                        dtype=d.disruption_type or "",
                        updated_ts=ts(d.last_updated),
                        from_ts=ts(d.from_date),
                        to_ts=ts(d.to_date),
                        route_ids=tuple(r.route_id for r in d.routes or [] if r.route_id is not None),
                        route_labels=tuple(labels),
                        stop_ids=tuple(s.stop_id for s in d.stops or [] if s.stop_id is not None),
                        stop_names=tuple(s.stop_name for s in d.stops or [] if s.stop_name),
                        modes=frozenset(modes),
                    )
                )
            except Exception:  # noqa: BLE001, S112
                continue
    return out
