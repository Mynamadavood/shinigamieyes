---
phase: 03-transit
status: passed
tested_by: David (iPhone)
date: 2026-11-17
deployed: 93d55ae (server code); smoke fix 02060db is local
---

# Phase 3 Transit - Device UAT

## Before the device check

- PTV key added by David on CT 110; health reports `ptv: idle`.
- Smoke run: `route_types: ok count=5`; `departures: ok rows=60 live=12 sched=48 runs_with_position=0`; `disruptions: ok total=204 types=11`; `agreement: 10/10 stop ids match store`.

## Tests

### 1. Stops (TRAN-01)
result: pass. Stop tags with name, distance and walk time; "none nearby" rows; edge pointers bring the stop back and open its card.

### 2. Departures (TRAN-02)
result: pass. Ticking rows with LIVE / SCHED and leave-in; one red LEAVE NOW row; row tap opens the stop card.

### 3. Vehicles (TRAN-03)
result: pass. Moving tram and bus markers with route numbers; estimated trams marked.

### 4. Disruptions (TRAN-04)
result: pass. Corner readout and list; warning marks on affected rows and cards.

### 5. Saved places and Home (D-04, D-21)
result: pass. Saved places show their own transit; Home shows none.

### 6. Countdown format (preference)
result: keep zero-padded `06:12` / `leave in 01:40`.

### 7. Catch grace, D-08 (preference)
result: keep. A departure stays catchable until leave-in is 30 s past zero. David accepted this narrowing of D-08.

### 8. One red row, D-09 (preference)
result: keep. Only the soonest leave-now row is red. David accepted this narrowing of D-09.

## Summary

8 of 8 items pass or are accepted as built. No gaps.

## Gaps

None.

## Notes

- Real PTV bus positions were not seen in the smoke sample (`runs_with_position=0`); vehicle markers passed on the device, but whether a real-position bus has been seen is not recorded.
- David's reply: "all pass - 6,7,8 yes to all", read as keep for 6, 7 and 8.
