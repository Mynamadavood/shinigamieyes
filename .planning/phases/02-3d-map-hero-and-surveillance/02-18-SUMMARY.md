---
phase: 02-3d-map-hero-and-surveillance
plan: 18
subsystem: deploy
tags: [deploy, verify, uat, gap-closure]
requires: ["02-15", "02-16", "02-17"]
provides: ["gap fixes live on the CT", "Gate 3 GO"]
affects: ["phase 2 close"]
key-files:
  created: []
  modified: [deploy/verify.sh, deploy/UAT-DEVICE.md, web/src/map/map.ts, web/src/map/map.test.ts, .planning/phases/02-3d-map-hero-and-surveillance/02-UAT.md]
decisions:
  - "Saved places with no CCTV within 150 m frame their road cameras instead (found on device; Monash, CBD and gym have no mapped CCTV that close)"
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 2 Plan 18: Gap-fix deploy and Gate 3 re-check Summary

The gap fixes (02-15..02-17) are live on the CT, both verify modes pass with zero failures and zero skips, and David signed Gate 3 GO on 2026-11-11.

## Results
- Pushed on David's "push" (8579cf1..74acc09, then ..6dc96a0); deployed over SSH.
- Camera job re-run: `cctv=674 guard=0 speed=189 redlight=136`. Victoria OSM has no `surveillance:type=guard` nodes today (the job reads the full Victoria extract), so guard posts have nothing to show yet.
- Final verify: `--local` `{"pass":26,"fail":0,"skip":0}`, `--remote` `{"pass":22,"fail":0,"skip":0}`, with `place_no_cameras` and `place_cameras` PASS.
- `/api/places`: Home `cameras:false`, the other three `cameras:true`, no coordinates.
- iPhone re-check (David): all four gap items pass.

## Deviations
1. [Rule 1] 02-15 left a literal CR in a `tr -d` argument in verify.sh; replaced with a `\r` escape (74acc09).
2. [Rule 1] The new places parse used a literal newline in a sed replacement (unterminated `s` command, hidden by `|| true`), so both place checks silently skipped. Now `\n` (3aec642).
3. [Rule 1] Device re-check looked unchanged: saved-place framing only used CCTV, and every saved place has 0 CCTV within 150 m. Framing now falls back to the road cameras (6dc96a0, test added; web 262 passed).

## Known Stubs
None. Guard posts are wired end to end but the current data has none.

## Self-Check: PASSED
