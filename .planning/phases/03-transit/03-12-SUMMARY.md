---
phase: 03-transit
plan: 12
subsystem: ops
tags: [deploy, systemd, verify, ptv, smoke]
requires:
  - phase: 03-05
    provides: health transit block
  - phase: 03-06
    provides: PtvClient
provides:
  - weekly hardened GTFS stop build (script, service, timer) and first-deploy build
  - verify.sh transit checks (layer, store freshness, PTV state, secret hygiene, Home leak)
  - manual redacted PTV smoke (module, script, tests)
affects: [deploy]
tech-stack:
  added: []
  patterns: [data job copies cameras refresh shape, redacted smoke output]
key-files:
  created:
    - deploy/refresh-transit.sh
    - deploy/shinigami-transit.service
    - deploy/shinigami-transit.timer
    - server/shinigami/transit/smoke.py
    - scripts/ptv_smoke.py
    - server/tests/test_ptv_smoke.py
  modified:
    - deploy/deploy.sh
    - deploy/shinigami.service
    - deploy/verify.sh
    - .env.example
key-decisions:
  - "Agreement check counts PTV stops-near ids that exist in store.get(), not only those returned by store.nearby (nearby returns one stop per mode, which would under-report)"
  - "run_status_values hint line omitted: Departure drops the raw run status, so it cannot be derived; it is optional in the plan"
requirements-completed: [TRAN-01, TRAN-02, TRAN-04]
completed: 2026-11-15
---

# Phase 3 Plan 12: Transit operations Summary

Weekly GTFS stop build on the CT, deploy and verify integration, and a redacted manual PTV smoke for when the key arrives.

## Tasks

1. Units and deploy integration: e977595
2. verify.sh transit checks: ca65daa
3. Smoke module, script, tests: 1260550

## Verification (run here, nothing deployed, no SSH, no systemd, no real PTV call)

- `bash -n` on every `deploy/*.sh`: clean.
- CR byte count 0 in refresh-transit.sh, deploy.sh, verify.sh, both units, shinigami.service, .env.example.
- Acceptance greps: MemoryMax=900M, ProtectSystem=strict, User=shinigami all present; SHINIGAMI_TRANSIT_STOPS_PATH in shinigami.service and .env.example; no uncommented PTV_DEVID/PTV_KEY; gtfs.zip only under `$DATA/tmp` in the script; `cameras_|transit_|distance_m` and `skip transit_ptv` present in verify.sh; 14 transit check-name matches.
- `uv run pytest server/tests/test_ptv_smoke.py`: 6 passed.
- `uv run ruff check server scripts/ptv_smoke.py`: clean.
- Full `uv run pytest -q`: 226 passed, 1 skipped.
- NOT verified: the shell checks in verify.sh and the units were syntax-checked only; they were never run against a live server or systemd.

## Deviations from Plan

- The acceptance grep `print\(.*(url|devid|key|signature)` matches the single literal message `print("PTV key not set")`, which is the required output and contains no secret.
- Agreement uses `store.get` (see decisions); run_status_values hint omitted.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED (files exist, commits e977595, ca65daa, 1260550 present)
