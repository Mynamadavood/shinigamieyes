"""FastAPI app factory: routers first, static files mounted last."""

import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from shinigami.api import health, places, profile, stream
from shinigami.places import load_places
from shinigami.providers.arpansa import ArpansaUvProvider
from shinigami.providers.base import ProviderContext
from shinigami.providers.sun import SunProvider
from shinigami.providers.uv_window import UvWindowProvider
from shinigami.runtime import EventBus, Runtime
from shinigami.settings import Settings, get_settings
from shinigami.store import Store

log = logging.getLogger("shinigami")

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; "
    "base-uri 'none'; frame-ancestors 'none'"
)
NO_CACHE_PATHS = {"/", "/index.html", "/sw.js", "/manifest.webmanifest"}


def create_app(settings: Settings | None = None, start_runtime: bool = True) -> FastAPI:
    settings = settings or get_settings()
    providers = [SunProvider(), ArpansaUvProvider(), UvWindowProvider()]
    ctx = ProviderContext(
        settings=settings,
        clock=time.time,
        store=Store(settings.db_path),  # lazy: no file I/O until first use
        http=httpx.AsyncClient(
            headers={"User-Agent": f"ShinigamiEyes/{settings.version} (private)"},
            timeout=10,
            limits=httpx.Limits(max_connections=10),
        ),
        bus=EventBus(),
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        runtime = None
        if start_runtime:
            runtime = Runtime(ctx, providers)
            ctx.runtime = runtime
            app.state.runtime = runtime
            await runtime.start()
        try:
            yield
        finally:
            if runtime is not None:
                await runtime.stop()
                ctx.runtime = None
            await ctx.http.aclose()
            ctx.store.close()

    app = FastAPI(title="Shinigami Eyes", version=settings.version, lifespan=lifespan)
    app.state.settings = settings
    app.state.ctx = ctx
    app.state.providers = providers
    app.state.places = {p.id: p for p in load_places(settings.places_path)}

    @app.middleware("http")
    async def headers_mw(request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h["Content-Security-Policy"] = CSP
        h["X-Content-Type-Options"] = "nosniff"
        h["Referrer-Policy"] = "no-referrer"
        h["Permissions-Policy"] = "geolocation=(self)"
        path = request.url.path
        if path.startswith("/api/"):
            if "cache-control" not in h:  # streams set their own no-cache
                h["Cache-Control"] = "no-store"
        elif path.startswith("/assets/"):
            h["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path in NO_CACHE_PATHS:
            h["Cache-Control"] = "no-cache"
        return response

    app.include_router(health.router)
    app.include_router(places.router)
    app.include_router(profile.router)
    app.include_router(stream.router)

    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")
    else:
        log.warning("static dir %s missing; serving API only", settings.static_dir)
    return app


app = create_app()
