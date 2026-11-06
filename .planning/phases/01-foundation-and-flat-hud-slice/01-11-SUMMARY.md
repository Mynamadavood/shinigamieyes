---
phase: 01-foundation-and-flat-hud-slice
plan: 11
subsystem: infra
tags: [deploy, uat, ios, pwa, geocode, photon, dns]
requires: [01-03, 01-08, 01-09, 01-10]
provides:
  - Phase 1 build live on CT 110 at https://shinigami.<tailnet>.ts.net
  - Gate 2 phase acceptance signed GO (11 of 12, 1 deferred)
  - type-ahead address suggestions (/api/suggest via Photon)
affects: [phase-02]
tech-stack:
  added: [Photon (komoot) public geocoder, server-side only]
  patterns: [server-side proxy for every third-party lookup, cache-forever query cache keyed by prefix]
key-files:
  created:
    - server/shinigami/api/suggest.py
    - server/tests/test_suggest.py
  modified:
    - server/shinigami/main.py
    - web/src/location-search.ts
    - web/src/location-search.test.ts
    - web/src/ui/location-sheet.ts
    - deploy/lxc-setup.sh
    - deploy/verify.sh
    - deploy/UAT-DEVICE.md
key-decisions:
  - "CT runs `tailscale set --accept-dns=false`: MagicDNS in the CT failed to resolve public hosts, and the CT never needs tailnet names"
  - "Type-ahead goes to Photon (Nominatim policy forbids autocomplete); the Search key still runs the Nominatim search as fallback"
  - "Client address-search timeout 9 s to cover the server's 3 s slot wait + 4 s upstream"
requirements-completed: []
duration: ~3h (human-paced)
completed: 2026-11-06
---

# Phase 1 Plan 11: Redeploy + Phase Acceptance (Gate 2) Summary

The 01-04..01-10 build was pushed (540b9e4), redeployed to CT 110, verified from the dev PC, and accepted on David's iPhone.

## Tasks

| # | Task | Result |
|---|------|--------|
| 1 | David redeploys, checks `places.toml` + `SHINIGAMI_CONTACT_EMAIL` | `verify.sh --local` `{"pass":14,"fail":0,"skip":0,"p95_ms":2}` |
| 2 | Claude remote verify (zero skips) + monash/geocode probes | final `verify.sh --remote` `{"pass":13,"fail":0,"skip":0,"p95_ms":44}`; monash pin returns `source:"pin"`, `lat:null`; geocode 200 |
| 3 | iPhone Gate 2 + full host reboot | GO: 11 of 12 pass, stale-row look deferred. GPS prompts once on first launch, never again |

## Deviations

1. **[Rule 1 - Bug] `stream_hello` false failure in verify.sh.** Under `pipefail`, curl's timeout/SIGPIPE exit masked a successful grep. Output now captured first (fa87ec4). Server unchanged.
2. **[Rule 1 - Bug] Address search dead in the CT.** Every uncached `/api/geocode` hit `ConnectTimeout`: MagicDNS (100.100.100.100) in the CT returned nothing for public hosts, while direct-IP connects took 0.04 s. Fix: `tailscale set --accept-dns=false` (lxc-setup.sh), new `dns_upstream` local check (457f5b2). Applied live by David.
3. **[Rule 1 - Bug] Client search timeout shorter than server worst case.** 4 s client vs up to 3 s slot wait + 4 s upstream. Raised to 9 s (457f5b2).
4. **[Scope add, approved by David] Type-ahead suggestions.** David found Search-key-only search unclear and asked for suggestions. Nominatim forbids autocomplete, so `/api/suggest` proxies Photon: fixed CBD bias point (never the user's position), Greater Melbourne bbox, AU only, deduped, cached forever, 0.5 s spacing with 429 past 1 s, query never logged. Sheet debounces 400 ms at 3+ chars (the UI-SPEC's original contract), aborts superseded requests, ignores stale replies. Remote `suggest_photon` check added (41a3032).

## Deferred

- Gate 2 "stale/expired rows dim/pulse": needs 30+ min with Tailscale off. Logic covered by `freshness.test.ts` and next-list expiry tests; on-device look to confirm later.

## Self-Check: PASSED
