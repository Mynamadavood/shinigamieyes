---
phase: 03-transit
plan: 02
subsystem: runtime
tags: [sse, runtime, privacy, transit]
requires: []
provides:
  - "bus touch events for exact-location polled providers"
  - "Runtime.nudge(provider_id) single-flight, 10 s guarded refresh"
  - "assemble.exact_allowed shared Home gate, used by the SSE touch path"
affects: [03-03, 03-04]
key-files:
  modified:
    - server/shinigami/runtime.py
    - server/shinigami/assemble.py
    - server/shinigami/api/stream.py
    - server/tests/conftest.py
    - server/tests/test_runtime.py
    - server/tests/test_stream.py
requirements-completed: [TRAN-02, TRAN-03, TRAN-04]
duration: n/a
completed: 2026-11-15
---

# Phase 3 Plan 02: Live-push plumbing Summary

Exact-location providers now publish a coordinate-free `touch`; each SSE subscriber turns it into a layer computed at its own server-held point behind the same fail-closed Home gate as `/api/profile`, and `Runtime.nudge` gives a rate-guarded fire-and-forget refresh.

## Tasks
1. Runtime touch + nudge: commit 455dfd8
2. exact_allowed gate + stream touch handling: commit 6baaaa3

## Deviations from Plan
- [Rule 3 - process] While running `ruff check --fix` over `server`, it also edited another plan's file `server/tests/test_refresh_transit.py` (removed a `# noqa: E731` on one line). Reverting it was blocked by the permission classifier, so it is left uncommitted in the tree for the 03-01 owner to restore (re-add `  # noqa: E731` to the `fake = lambda n: ...` line in `test_refuses_to_shrink`). I did not commit it.

## Verification
- test_runtime.py: 11 passed. test_stream.py (incl. 5 new touch tests), test_places.py, test_profile_readonly.py: all pass. `ruff check server` passed at the time of my run.
- One transient failure (`test_profile_readonly` p95 latency, and one live-server connect-refused) occurred while my own pytest runs overlapped under load; both pass when re-run alone.
- Full `uv run pytest -q` of the whole suite was not run (other plans' work in progress).

## Known Stubs
None.

## Self-Check: PASSED
