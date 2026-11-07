#!/usr/bin/env bash
# Extract Greater Melbourne from the Protomaps daily build into /var/lib/shinigami/tiles.
# Run as user shinigami:  refresh-tiles.sh --dry-run   (size check first)
#                         refresh-tiles.sh             (real extract, atomic swap)
# The server notices the new file within 30 s (TileStore.reload_if_changed).
set -euo pipefail
# pct exec and runuser use a minimal PATH without /usr/local/bin (where pmtiles lives).
export PATH="/usr/local/bin:$PATH"

TILES_DIR=/var/lib/shinigami/tiles
BBOX=144.2,-38.55,145.75,-37.45   # Greater Melbourne incl. Geelong, Mornington Pen., Dandenongs
MIN_FREE_MB="${MIN_FREE_MB:-3072}"
UA="ShinigamiEyes-tiles/1 (private)"

[ "$(id -u)" -ne 0 ] || { echo "do not run as root; use: sudo -u shinigami $0" >&2; exit 1; }

url=""
for i in $(seq 0 7); do
  d="$(date -u -d "-${i} day" +%Y%m%d)"
  if curl -sfI -A "$UA" --max-time 20 "https://build.protomaps.com/${d}.pmtiles" >/dev/null; then
    url="https://build.protomaps.com/${d}.pmtiles"; break
  fi
done
[ -n "$url" ] || { echo "no Protomaps build found in the last 8 days" >&2; exit 1; }
echo "source build: ${url##*/}"

mkdir -p "$TILES_DIR"
tmp="$TILES_DIR/greater-melbourne.pmtiles.tmp"

if [ "${1:-}" = "--dry-run" ]; then
  pmtiles extract "$url" "$tmp" --bbox="$BBOX" --maxzoom=15 --dry-run
  df -h /var/lib/shinigami
  exit 0
fi

avail="$(df --output=avail -m /var/lib/shinigami | tail -n1 | tr -d ' ')"
if [ "$avail" -lt "$MIN_FREE_MB" ]; then
  echo "only ${avail} MB free, need ${MIN_FREE_MB} MB." >&2
  echo "On the Proxmox host run: pct resize <CTID> rootfs +8G" >&2
  exit 1
fi

rm -f "$tmp"
pmtiles extract "$url" "$tmp" --bbox="$BBOX" --maxzoom=15
pmtiles verify "$tmp"
mv -f "$tmp" "$TILES_DIR/greater-melbourne.pmtiles"
ls -lh "$TILES_DIR/greater-melbourne.pmtiles"
