---
phase: 03-transit
plan: 20
subsystem: uat
tags: [uat, ptv, device]
requires: [03-19]
provides: [live PTV confirmed, Gate 4 GO]
key-files:
  created: [.planning/phases/03-transit/03-UAT.md]
  modified: [deploy/UAT-DEVICE.md, server/shinigami/transit/smoke.py]
requirements-completed: [TRAN-01, TRAN-02, TRAN-03, TRAN-04]
completed: 2026-11-17
---

# Phase 3 Plan 20: PTV key and device UAT Summary

David added the PTV key on CT 110, the live smoke check passed on all four steps, and the device check passed on all five items with the three preference items kept as built: Gate 4 is GO.

## Results

- Smoke: route types ok (5); departures ok (60 rows, 12 live, 48 scheduled); disruptions ok (204, 11 types); stop-id agreement 10/10.
- Device: stops, departures, vehicles, disruptions and Home protection all pass.
- Preferences: zero-padded countdowns kept; 30 s catch grace kept (D-08 narrowing accepted); single red leave-now row kept (D-09 narrowing accepted).

## Deviations

- **Smoke script crash (fixed, 02060db):** run as `shinigami` from `/root`, `Settings()` probed a relative `.env` in an unreadable folder and raised EACCES. `smoke.py` now uses `Settings(_env_file=None)`; the caller sources `/etc/shinigami/.env`. Not yet pushed or deployed; it only affects the manual smoke script.
- The documented smoke command used `sudo`, which the CT does not have; `runuser -u shinigami -- bash -c 'cd /opt/shinigami && ...'` is the working form.

## Not verified

- No real PTV bus position appeared in the smoke sample (`runs_with_position=0`).
