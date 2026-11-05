# Shinigami Eyes

Private Watch Dogs-style HUD of David's surroundings. FastAPI backend plus an installable iOS PWA, reachable only over Tailscale.

## Local full-stack run

```
uv sync
npm --prefix web ci
npm --prefix web run build
uv run uvicorn shinigami.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

Then open http://127.0.0.1:8000.

Dev mode (Vite with HMR, proxies /api to the backend): `npm --prefix web run dev`.

Tests: `uv run pytest -q` and `npm --prefix web run test -- --run`.
