"""GET /api/stream: SSE live fill-in. Events: hello, layer, ping (named, not comments).

Privacy: nothing here logs coordinates or the cell id.
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Literal

from fastapi import APIRouter, Query, Request
from sse_starlette import EventSourceResponse, ServerSentEvent

from shinigami.api.profile import camera_ok, resolve_location
from shinigami.assemble import assemble_profile
from shinigami.geo import snap_cell

router = APIRouter()

PING_INTERVAL_S = 15.0
POLL_S = 1.0


async def event_stream(
    ctx,
    providers,
    location,
    lat: float,
    lon: float,
    is_disconnected: Callable[[], Awaitable[bool]],
    exact_ok: bool = False,
) -> AsyncIterator[ServerSentEvent]:
    # subscribe BEFORE hello so no update between snapshot and loop is lost
    queue = ctx.bus.subscribe()
    try:
        profile = assemble_profile(ctx, providers, location, lat, lon, exact_ok=exact_ok)
        yield ServerSentEvent(
            event="hello", data=json.dumps({"server_time": ctx.clock(), "rev": profile.rev})
        )
        for layer in profile.layers.values():
            yield ServerSentEvent(event="layer", data=layer.model_dump_json())
        cell_id = snap_cell(lat, lon).id
        while True:
            if await is_disconnected():
                return
            try:
                ev = await asyncio.wait_for(queue.get(), timeout=POLL_S)
            except TimeoutError:
                continue
            if ev.get("type") != "layer":
                continue
            if ev.get("cell") not in ("global", cell_id):
                continue
            yield ServerSentEvent(event="layer", data=json.dumps(ev["layer"]))
    finally:
        ctx.bus.unsubscribe(queue)


@router.get("/api/stream")
async def stream(
    request: Request,
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    place: str | None = Query(None, max_length=32, pattern="^[a-z0-9_-]+$"),
    src: Literal["gps", "search"] = "gps",
    label: str | None = Query(None, max_length=120),
):
    location, lat, lon = resolve_location(request, lat, lon, place, src, label)
    gen = event_stream(
        request.app.state.ctx,
        request.app.state.providers,
        location,
        lat,
        lon,
        request.is_disconnected,
        exact_ok=camera_ok(request, location),
    )
    return EventSourceResponse(
        gen,
        ping=PING_INTERVAL_S,
        ping_message_factory=lambda: ServerSentEvent(event="ping", data=str(time.time())),
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
