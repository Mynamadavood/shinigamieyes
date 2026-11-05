# Walking Skeleton — Shinigami Eyes

**Phase:** 1
**Generated:** 2026-11-05

## Capability Proven End-to-End

David opens `https://shinigami.<tailnet>.ts.net` on his iPhone over Tailscale, installs it to the home screen, and the full-screen PWA (served by FastAPI in the `shinigami` LXC) shows a live server health line and a ticking SSE probe counter — proving LXC → tailscaled → `tailscale serve` HTTPS → uvicorn → StaticFiles + SSE → iOS standalone PWA before any feature is built (plans 01-01, 01-02, 01-03). Every later plan in Phase 1 is a vertical slice on top of this pipe.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend framework | FastAPI 0.162 on uvicorn 0.54, **one worker**, `--no-access-log`, `--timeout-graceful-shutdown 5`, bound to `127.0.0.1:8000` | Project-mandated; single worker keeps the in-process cache, event bus and background tasks shared; access log would write coordinates to journald |
| Python tooling | uv-managed Python 3.12 (`requires-python >=3.12,<3.14`), hatchling package `server/shinigami`, `uv.lock` committed | Same interpreter on Windows dev and Debian LXC; reproducible |
| Frontend | Vite 8 + vanilla TypeScript DOM modules (no framework), vite-plugin-pwa 2 `injectManifest` with `web/src/sw.ts` | Smallest bundle on iPhone; SW precaches shell + fonts only, never `/api/*` |
| Origin | One origin: FastAPI serves `web/dist` via `StaticFiles` mounted LAST, `/api/*` routes first | No CORS, one cert, CSP `default-src 'self'` |
| Transport | HTTPS from `tailscale serve --bg --https=443 http://127.0.0.1:8000` on the LXC's own tailnet node `shinigami` (D-12). Never Funnel | Real Let's Encrypt cert trusted by iOS; tailnet-only |
| Live updates | Server-Sent Events via `sse-starlette` (`/api/stream`), `event: hello` first, real `event: ping` frames every 15 s, whole-layer replacement events | Server→phone only; idempotent; iOS-safe reconnect on `visibilitychange`/`pageshow`/`online` + 40 s watchdog |
| Data contract | `Item` / `Layer` / `Profile` pydantic models in `server/shinigami/schema.py`, mirrored in `web/src/types.ts`. Every item carries an ABSOLUTE `target_ts` (epoch s UTC), `fetched_at`, `stale_after_s`; `kind` is a closed allow-list with no person kinds | Countdowns stay correct from cache/after backgrounding; privacy hard rule enforced in the type |
| Provider contract | `server/shinigami/providers/base.py`: `ProviderMeta` + `Provider` protocol (`query()` is read-only; network only in background `refresh()`/`fetch_cell()`) | `/api/profile` never waits on upstream (PLAT-04); adding a layer = one module |
| Data layer (server) | stdlib `sqlite3` in WAL mode at `SHINIGAMI_DB_PATH` (`/var/lib/shinigami/shinigami.db` on the LXC): tables `layer_cache(provider_id, cell, payload, fetched_at)` and `geocode_cache(q_norm, payload, created_at)`, in-memory dict on top | One file, trivially backed up by vzdump; restart is never cold |
| Data layer (device) | IndexedDB via `idb-keyval`: `profile:last`, `sync:last`, `location:state`, `places:list` | iOS evicts SW caches; IDB is the offline store; render from IDB before any network |
| Time | Server computes absolute times (astral, Open-Meteo unixtime); client renders `target_ts − (Date.now() + offset)` with offset from RTT midpoint, 1 Hz boundary-aligned ticker | D-04; never a decrementing counter |
| Auth | None at app level; network-level only (tailnet membership), loopback bind, no Funnel; optional tailnet ACL later | Single private user; ASVS V2 satisfied by the network boundary |
| Secrets/config | `/etc/shinigami/.env` and `/etc/shinigami/places.toml` (mode 0640 root:shinigami) on the LXC only; `deploy/places.example.toml` + `.env.example` in git with placeholders | Home coordinates and keys never in git (D-09) |
| Deployment target | New unprivileged Debian LXC `shinigami` on Proxmox (`onboot 1`, `/dev/net/tun` passthrough), systemd unit `shinigami.service` (`Restart=always`), code at `/opt/shinigami` via `git pull` from GitHub + `deploy/deploy.sh` (uv sync, npm ci, vite build, restart). Node 22 from NodeSource on the LXC | D-11, D-12, D-13, D-15; PLAT-07 |
| Verification | `uv run pytest`, `npm --prefix web run test -- --run`, `deploy/verify.sh --local` (on LXC) and `deploy/verify.sh --remote <url>` (from the dev PC, which is on the tailnet per D-14), plus `deploy/UAT-DEVICE.md` gates signed by David | Claude has no SSH (D-13) |
| Directory layout | `server/shinigami/{main,settings,schema,geo,store,runtime,assemble,places}.py`, `server/shinigami/api/*.py`, `server/shinigami/providers/*.py`, `server/tests/`; `web/src/{main,types,format,clock,ticker,model,freshness,net,store,offgrid,location}.ts`, `web/src/ui/*.ts`, `web/src/styles/{tokens,app}.css`; `deploy/`; `scripts/` | Flat, discoverable; one module per provider and per API router |

## Stack Touched in Phase 1

- [ ] Project scaffold (framework, build, lint, test runner) — 01-01
- [ ] Routing — at least one real route (`/api/health`, `/api/_sse_probe` in 01-01; `/api/profile` in 01-04)
- [ ] Database — at least one real read AND one real write (SQLite `layer_cache` write by ARPANSA/UV-window refresh and read by `/api/profile` in 01-06; IndexedDB `profile:last` write/read in 01-08)
- [ ] UI — at least one interactive element wired to the API (`PIN` → Place Sheet → `/api/places` / `/api/profile?place=` in 01-09; address search → `/api/geocode` in 01-10)
- [ ] Deployment — running on the `shinigami` LXC behind `tailscale serve`, installed on David's iPhone (01-03, re-verified in 01-11)

## Out of Scope (Deferred to Later Slices)

- 3D MapLibre map, hero eyes activation, floating tags, info cards, self-hosted tiles (Phase 2)
- Map-drop pin (Phase 2; D-08)
- Ranked "next" strip with urgency × relevance × severity, colour-banded chips, layer toggles (Phase 4) — Phase 1 uses a simple soonest-first sort
- Shortcuts prewarm endpoint (Phase 7), glitch effects (Phase 7), Sources screen (Phase 7)
- Any API-key provider (PTV, GTFS-R, EPA, OpenElectricity, aisstream)
- APScheduler, orjson, Shapely, pyproj, aiosqlite (not needed until later phases)
- Push notifications, multi-user, app-level auth

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- Phase 2: dark tilted 3D map with tags/cards, hero activation, CCTV/road cameras (the `next-list` mounts into the map drawer)
- Phase 3: transit stops, live departures, approaching vehicles, disruptions (new providers on the same contract)
- Phase 4: weather/rain, air, fire danger, pollen, grid/water; ranked next strip, chips, layer toggles
- Phase 5: hazards with pre-empting banner, planes, ISS/satellite passes, ships
- Phase 6: heritage/Wikipedia, towers, CBD city data, listen-in link-outs, out-of-coverage status
- Phase 7: Shortcut prewarm, glitch effects, Sources screen, soak test and backups
