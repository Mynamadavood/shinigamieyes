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
    return {"status": "ok", "version": settings.version, "server_time": time.time()}


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
