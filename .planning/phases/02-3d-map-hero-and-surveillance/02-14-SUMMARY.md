---
phase: 02-3d-map-hero-and-surveillance
plan: 14
subsystem: acceptance
tags: [deploy, verify, uat, gate-3]
requires: ["02-06", "02-11", "02-12", "02-13"]
provides: ["Phase 2 deployed and accepted on the iPhone (Gate 3 GO)"]
affects: ["phase 2 close", "gap plans 02-15..02-18"]
key-files:
  created: [.planning/phases/02-3d-map-hero-and-surveillance/02-UAT.md]
  modified: [deploy/UAT-DEVICE.md, server/tests/test_places.py]
decisions:
  - "Provisional 1 flipped: cameras for every saved place except Home (Home fails closed)"
  - "Provisional 2 flipped: guard posts shown; owner names shown unless private/individual owner, residential spot or contact-like"
  - "Provisional 3 and 4 confirmed: Source OpenStreetMap, colour-only building highlight, BUILDING title; server-side tiles"
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 2 Plan 14: Phase acceptance (Gate 3) Summary

Phase 2 is deployed and accepted: verify passes locally and remotely with zero failures and skips, and David signed Gate 3 GO on the iPhone on 2026-11-11 after four follow-ups were fixed in gap plans 02-15..02-18.

## Results
- Pre-check (2026-11-08, 8579cf1): `--local` 25/0/0, `--remote` 21/0/0, tiles meta ok, `/sw.js` 200.
- Gate 3 (David, 2026-11-07..10): 17 of 19 pass; skipped Reduced Motion (not tried) and Safari Web Inspector (no Mac; covered by verify's CSP and CDN checks).
- David flipped provisional decisions 1 and 2 and chose "fix first, then GO"; with two layout notes (edge-clipped tag label, card over tags) these became gaps in 02-UAT.md, closed by 02-15, 02-16, 02-17 and deployed in 02-18.
- Final: `--local` 26/0/0, `--remote` 22/0/0 (6dc96a0); Gate 3 GO.

## Deviations
1. [Rule 1] `test_profile_place_pin` was date-dependent (Monash and CBD cells are 0.1 degree apart, under 30 s of solar time, so whole-minute sun times sometimes matched). It now checks the times equal those for Monash's own cell (1c446e8, test only).
2. Task 1 (David deploys) was run by Claude over SSH under the CT 110 access granted in 02-06.

## Known Stubs
None.

## Self-Check: PASSED
