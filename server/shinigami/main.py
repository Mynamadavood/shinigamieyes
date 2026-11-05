"""FastAPI app factory: routers first, static files mounted last."""

import logging
import time

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from shinigami.api import health, profile
from shinigami.providers.base import ProviderContext
from shinigami.providers.sun import SunProvider
from shinigami.settings import Settings, get_settings

log = logging.getLogger("shinigami")

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; "
    "base-uri 'none'; frame-ancestors 'none'"
)
NO_CACHE_PATHS = {"/", "/index.html", "/sw.js", "/manifest.webmanifest"}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Shinigami Eyes", version=settings.version)
    app.state.settings = settings
    app.state.ctx = ProviderContext(settings=settings, clock=time.time)
    app.state.providers = [SunProvider()]

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
            h["Cache-Control"] = "no-store"
        elif path.startswith("/assets/"):
            h["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path in NO_CACHE_PATHS:
            h["Cache-Control"] = "no-cache"
        return response

    app.include_router(health.router)
    app.include_router(profile.router)

    if settings.static_dir.is_dir():
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="static")
    else:
        log.warning("static dir %s missing; serving API only", settings.static_dir)
    return app


app = create_app()
