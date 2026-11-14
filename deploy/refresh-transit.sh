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

curl -fL --max-filesize 1073741824 --retry 3 -A "ShinigamiEyes-data/1 (private)" \
  -o "$ZIP" \
  https://data.ptv.vic.gov.au/downloads/gtfs.zip

/opt/shinigami/.venv/bin/python -m shinigami.data.refresh_transit \
  --input "$ZIP" --output "$DATA/data/transit_stops.json"
