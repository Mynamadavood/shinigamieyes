"""Health check and SSE probe (proves SSE is not buffered by the proxy)."""

import asyncio
import time

from fastapi import APIRouter, Query, Request
from sse_starlette.sse import EventSourceResponse

PROBE_INTERVAL_S = 1.0

router = APIRouter()


@router.get("/api/health")
async def health(request: Request) -> dict:
    settings = request.app.state.settings
    now = time.time()
    # Review WR-S8: camera store status (loaded, count, dataset age). Never coordinates.
    cams = request.app.state.cameras
    age_days = None
    if cams.loaded and cams.built_at is not None:
        age_days = max(0, int((now - cams.built_at) // 86400))
    return {
        "status": "ok",
        "version": settings.version,
        "server_time": now,
        "tiles": request.app.state.tiles.status,
        "cameras": {"loaded": cams.loaded, "count": cams.count, "age_days": age_days},
    }


@router.get("/api/_sse_probe")
async def sse_probe(n: int = Query(30, ge=1, le=60)) -> EventSourceResponse:
    async def gen():
        for i in range(1, n + 1):
            yield {"event": "tick", "data": str(i)}
            if i < n:
                await asyncio.sleep(PROBE_INTERVAL_S)

    return EventSourceResponse(
        gen(), headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
