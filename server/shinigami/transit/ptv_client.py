"""PTV Timetable API v3 client: HMAC-SHA1 signing, rate guard, leak-proof errors.

This module never logs. Callers log only the provider id, type(exc).__name__ and exc.kind:
httpx errors embed the full signed URL (devid + signature), so they are never propagated.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
from collections import deque
from collections.abc import Callable, Iterable

import httpx

from shinigami.transit.model import (
    Disruption,
    PatternStop,
    StopDepartures,
    parse_departures,
    parse_disruptions,
    parse_pattern,
)

BASE_URL = "https://timetableapi.ptv.vic.gov.au"


class PtvError(Exception):
    """Failure with a coarse kind only; str(err) == kind, never URL or credentials."""

    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


def sign_path(path_and_query: str, devid: str, key: str) -> str:
    sep = "&" if "?" in path_and_query else "?"
    msg = f"{path_and_query}{sep}devid={devid}"
    sig = hmac.new(key.encode("ascii"), msg.encode("ascii"), hashlib.sha1).hexdigest().upper()
    return f"{BASE_URL}{msg}&signature={sig}"


def _build(path: str, pairs: Iterable[tuple[str, object]]) -> str:
    qs = "&".join(f"{k}={v}" for k, v in pairs)
    return f"{path}?{qs}" if qs else path


class PtvClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        devid: str,
        key: str,
        clock: Callable[[], float] = time.monotonic,
        max_per_min: int = 60,
        max_inflight: int = 4,
        max_bytes: int = 2_000_000,
        timeout_s: float = 10.0,
    ):
        self._http = http
        self._devid = devid
        self._key = key
        self._clock = clock
        self._max_per_min = max_per_min
        self._max_bytes = max_bytes
        self._timeout_s = timeout_s
        self._calls: deque[float] = deque()
        self._sem = asyncio.Semaphore(max_inflight)

    def _guard(self) -> None:
        now = self._clock()
        while self._calls and now - self._calls[0] >= 60.0:
            self._calls.popleft()
        if len(self._calls) >= self._max_per_min:
            raise PtvError("rate_guard")
        self._calls.append(now)

    async def _get_json(self, path_and_query: str) -> dict:
        self._guard()
        url = sign_path(path_and_query, self._devid, self._key)
        try:
            async with self._sem:
                body = await self._read_capped(url)
        except httpx.TimeoutException:
            raise PtvError("timeout") from None
        except httpx.HTTPError:
            raise PtvError("network") from None
        try:
            js = json.loads(body)
        except ValueError:
            raise PtvError("bad_json") from None
        if not isinstance(js, dict):
            raise PtvError("bad_json") from None
        return js

    async def _read_capped(self, url: str) -> bytes:
        """Stream the body and stop as soon as it passes max_bytes (review WR-S6).

        httpx decompresses transparently, so counting the decoded chunks also stops a gzip bomb
        before it is buffered in the single uvicorn process.
        """
        async with self._http.stream("GET", url, timeout=self._timeout_s) as r:
            sc = r.status_code
            if not 200 <= sc < 300:
                if sc in (403, 404, 429):
                    raise PtvError(f"http_{sc}") from None
                raise PtvError("http_5xx" if sc >= 500 else "http_other") from None
            declared = r.headers.get("content-length", "")
            if declared.isdigit() and int(declared) > self._max_bytes:
                raise PtvError("too_large") from None
            buf = bytearray()
            async for chunk in r.aiter_bytes():
                buf += chunk
                if len(buf) > self._max_bytes:
                    raise PtvError("too_large") from None
            return bytes(buf)

    async def departures(
        self, route_type: int, stop_id: int, max_results: int = 25, include_cancelled: bool = False
    ) -> StopDepartures:
        pairs: list[tuple[str, object]] = [
            ("max_results", max_results),
            ("expand", "Run"),
            ("expand", "Route"),
            ("expand", "Direction"),
            ("expand", "Disruption"),
            ("expand", "VehiclePosition"),
        ]
        if include_cancelled:
            pairs.append(("include_cancelled", "true"))
        js = await self._get_json(
            _build(f"/v3/departures/route_type/{route_type}/stop/{stop_id}", pairs)
        )
        return parse_departures(js, route_type)

    async def pattern(self, run_ref: str, route_type: int) -> list[PatternStop]:
        js = await self._get_json(
            _build(
                f"/v3/pattern/run/{run_ref}/route_type/{route_type}",
                [("expand", "Stop"), ("expand", "Run")],
            )
        )
        return parse_pattern(js, route_type)

    async def disruptions(self, route_types: Iterable[int] = (0, 1, 2)) -> list[Disruption]:
        js = await self._get_json(
            _build("/v3/disruptions", [("route_types", t) for t in route_types])
        )
        return parse_disruptions(js)

    async def route_types(self) -> int:
        js = await self._get_json("/v3/route_types")
        rows = js.get("route_types")
        return len(rows) if isinstance(rows, list) else 0

    async def stops_near(
        self, lat: float, lon: float, route_types: Iterable[int], max_distance: int
    ) -> list[int]:
        pairs: list[tuple[str, object]] = [("route_types", t) for t in route_types]
        pairs += [("max_distance", max_distance), ("max_results", 10)]
        js = await self._get_json(_build(f"/v3/stops/location/{lat:.6f},{lon:.6f}", pairs))
        out: list[int] = []
        for s in js.get("stops") or []:
            sid = s.get("stop_id") if isinstance(s, dict) else None
            if isinstance(sid, int):
                out.append(sid)
        return out
