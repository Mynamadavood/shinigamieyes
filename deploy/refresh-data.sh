#!/usr/bin/env bash
# Weekly camera refresh, run by shinigami-data.service as the shinigami user.
# Downloads the Geofabrik Victoria PBF, builds cameras.json, deletes the PBF.
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "FATAL: refuse to run as root" >&2
  exit 1
fi

DATA=/var/lib/shinigami
PBF="$DATA/tmp/victoria.osm.pbf"
mkdir -p "$DATA/tmp" "$DATA/data"
trap 'rm -f "$PBF"' EXIT

curl -fL --max-filesize 1073741824 --retry 3 -A "ShinigamiEyes-data/1 (private)" \
  -o "$PBF" \
  https://download.geofabrik.de/australia-oceania/australia/victoria-latest.osm.pbf

/opt/shinigami/.venv/bin/python -m shinigami.data.refresh_cameras \
  --input "$PBF" --output "$DATA/data/cameras.json"
