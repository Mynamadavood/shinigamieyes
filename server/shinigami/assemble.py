"""Assemble a Profile from provider layers. Read-only; never touches the network."""

import logging

from shinigami.geo import snap_cell
from shinigami.providers.base import Provider, ProviderContext
from shinigami.schema import Layer, Profile, ProfileLocation

log = logging.getLogger("shinigami.assemble")


def assemble_profile(
    ctx: ProviderContext,
    providers: list[Provider],
    location: ProfileLocation,
    lat: float,
    lon: float,
    *,
    exact_ok: bool = False,
) -> Profile:
    now = ctx.clock()
    layers: dict[str, Layer] = {}
    cell = snap_cell(lat, lon)
    pin = location.source == "pin"
    for p in providers:
        # Saved places get camera layers only when their Place.cameras is true (Home never);
        # default False so any caller that forgets fails closed.
        if p.meta.exact_location_only and pin and not exact_ok:
            continue
        # Review WR-S2: a pin's true point goes only to exact providers that were allowed
        # above; every other provider sees the 0.1 degree cell centre, so a future provider
        # that echoes geometry, a distance or a bearing cannot reveal the place.
        qlat, qlon = (lat, lon) if (not pin or p.meta.exact_location_only) else (cell.lat, cell.lon)
        try:
            layer = p.query(ctx, qlat, qlon, now)
        except Exception as exc:  # noqa: BLE001 - a failing provider must not break the profile
            # log provider id and exception type only, never coordinates
            log.warning("provider %s failed: %s", p.meta.id, type(exc).__name__)
            layer = Layer(
                id=p.meta.id,
                status="error",
                rev=int(now),
                as_of=None,
                attribution=p.meta.attribution,
                items=[],
            )
        layers[layer.id] = layer
        if (
            p.meta.tier == "on_demand"
            and layer.status in ("pending", "stale")
            and ctx.runtime is not None
        ):
            try:
                # fire-and-forget; never awaited in the request path
                ctx.runtime.request_cell(p.meta.id, cell)
            except Exception as exc:  # noqa: BLE001
                log.warning("request failed provider=%s err=%s", p.meta.id, type(exc).__name__)
    rev = max((layer.rev for layer in layers.values()), default=int(now))
    return Profile(server_time=now, rev=rev, location=location, layers=layers)
