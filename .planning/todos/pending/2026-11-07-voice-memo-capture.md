---
title: Voice memo capture (record on phone, send straight to server)
area: new-capability
created: 2026-11-07
source: David, during Phase 2 execution
status: pending
---

## Idea
A record button in the app: David triggers an audio recording when he needs it, and the audio goes to his server immediately (stream or upload right after stop), not kept on the phone.

## Constraints to carry into planning
- Privacy/legal (PROJECT.md, Victoria Surveillance Devices Act): David's own voice notes only. Never a covert/ambient recorder of other people's conversations. Recordings stay private on the server, never shared or rebroadcast.
- Tailscale-only upload to the FastAPI backend; storage under /var/lib/shinigami (systemd sandbox), with retention/size caps.
- iOS PWA limits: MediaRecorder works in Safari while the app is in the foreground; no background recording. Explicit tap to start/stop; visible recording indicator.
- Possible follow-ons (separate decisions): on-server transcription (whisper.cpp was already anticipated in PROJECT.md), LifeOS hand-off.

## Fit
New capability, not Phase 2 scope. Candidate for a later phase or the hardware/LifeOS milestone.
