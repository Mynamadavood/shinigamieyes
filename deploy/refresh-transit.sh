#!/usr/bin/env bash
# Weekly transit stop refresh, run by shinigami-transit.service as the shinigami user.
# Downloads the public PTV GTFS zip (no key), builds transit_stops.json, deletes the zip.
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "FATAL: refuse to run as root" >&2
  exit 1
fi

DATA=/var/lib/shinigami
ZIP="$DATA/tmp/gtfs.zip"
mkdir -p "$DATA/tmp" "$DATA/data"
trap 'rm -f "$ZIP"' EXIT

# Bounded download (review WR-S8): a stalled transfer must not hang the unit (or a first
# deploy) forever, and redirects may only go to https.
curl -fL --proto '=https' --proto-redir '=https' \
  --connect-timeout 20 --max-time 1200 --speed-limit 10240 --speed-time 60 \
  --max-filesize 1073741824 --retry 3 -A "ShinigamiEyes-data/1 (private)" \
  -o "$ZIP" \
  https://data.ptv.vic.gov.au/downloads/gtfs.zip

/opt/shinigami/.venv/bin/python -m shinigami.data.refresh_transit \
  --input "$ZIP" --output "$DATA/data/transit_stops.json"
