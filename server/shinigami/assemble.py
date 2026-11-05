"""Assemble a Profile from provider layers. Read-only; never touches the network."""

import logging

from shinigami.providers.base import Provider, ProviderContext
from shinigami.schema import Layer, Profile, ProfileLocation

log = logging.getLogger("shinigami.assemble")


def assemble_profile(
    ctx: ProviderContext,
    providers: list[Provider],
    location: ProfileLocation,
    lat: float,
    lon: float,
) -> Profile:
    now = ctx.clock()
    layers: dict[str, Layer] = {}
    for p in providers:
        try:
            layer = p.query(ctx, lat, lon, now)
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
    rev = max((layer.rev for layer in layers.values()), default=int(now))
    return Profile(server_time=now, rev=rev, location=location, layers=layers)
