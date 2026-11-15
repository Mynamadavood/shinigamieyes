---
phase: 03-transit
plan: 19
subsystem: deploy
tags: [deploy, verify, transit]
requires: [03-12, 03-17, 03-18]
provides: [transit live on CT 110 in no-key mode, Gate 4 automated pre-check]
key-files:
  modified: [deploy/UAT-DEVICE.md]
requirements-completed: []
completed: 2026-11-15
---

# Phase 3 Plan 19: Ship transit to CT 110 Summary

Transit is deployed to CT 110 at 93d55ae and verified locally and remotely with zero failures; it runs in no-key mode until David adds the PTV key.

## What was done

- Local gates before the push: `uv run pytest -q` 277 passed, 1 skipped; `ruff check server` clean; web tests 411 passed; `npm run build` ok; `bash -n` on all deploy scripts; no CR/NUL bytes in deploy files; no zip, `.env` or `places.toml` tracked.
- David said "Push". Pushed `7f702d4..93d55ae` to origin/main.
- Deployed with `ssh shinigami 'bash /opt/shinigami/deploy/deploy.sh'`.
- First stop build: `train=226 tram=1088 bus=16194 skipped=0`; health reports 17480 stops loaded, `ptv: no_key`. The GTFS tmp directory is empty after the build.
- Local verify: `{"mode":"local","pass":30,"fail":0,"skip":1,"p95_ms":13}`.
- Remote verify: `{"mode":"remote","pass":26,"fail":0,"skip":1,"p95_ms":274}`.
- Gate 4 automated pre-check recorded in `deploy/UAT-DEVICE.md`.

## Deviations

- **Deploy had to run twice.** `deploy.sh` updates itself during `git pull`, so the first run executed the previous copy: the transit units were not installed and `transit_loaded` failed (29 pass, 1 fail). The second run installed the timer, built the stop file and passed. Follow-up worth doing: have `deploy.sh` re-exec itself after the pull.
- **Tidy-up commit before the push.** A linter auto-fix by another executor had removed an unneeded `# noqa: E731` from `server/tests/test_refresh_transit.py`; committed as `style(03-01)` so the tree was clean.
- Executed inline by the orchestrator, not by an executor agent.

## Not verified

- Live PTV behaviour (no key yet): the only SKIP is `transit_ptv`.
- Nothing has been checked on the iPhone yet (plan 03-20).
