# PTV fixtures

These fixtures are **schema-derived from PTV v3 swagger 2026-11-13, not recorded (D-24)**.

They are hand-built from the public PTV Timetable API v3 swagger shapes with synthetic ids
(stops, runs, routes, disruptions) and invented coordinates. No call was made to PTV, no key was
used and nothing here was recorded. `vehicle_descriptor` blocks (operator / vehicle id) are
included in the bus fixture only to prove the parser drops them.

Once the PTV key has arrived, replace them with redacted recordings (strip devid and signature
from any URLs, drop vehicle descriptors, keep ids that are public) and re-run
`uv run pytest server/tests/test_ptv_client.py`. Then verify manually: one live and one
scheduled-only departure, and the exact value of a cancelled train run status (assumption A5).
