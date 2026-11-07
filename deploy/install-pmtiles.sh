#!/usr/bin/env bash
# Install a checksum-pinned go-pmtiles CLI into /usr/local/bin (run as root in the CT).
# sha256 source: GitHub release v1.31.2 asset "digest" field (API), read 2026-11-07.
# Override with PMTILES_SHA256=... if you pin a different version.
set -euo pipefail
# pct exec and runuser use a minimal PATH without /usr/local/bin (where pmtiles lives).
export PATH="/usr/local/bin:$PATH"

PMTILES_VERSION=1.31.2
ASSET="go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz"
PMTILES_SHA256="${PMTILES_SHA256:-3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f}"
URL="https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${ASSET}"

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
[ -n "$PMTILES_SHA256" ] || { echo "PMTILES_SHA256 required" >&2; exit 1; }
[ "$(uname -m)" = "x86_64" ] || { echo "only x86_64 supported" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -A "ShinigamiEyes-tiles/1 (private)" -o "$tmp/$ASSET" "$URL"
echo "$PMTILES_SHA256  $tmp/$ASSET" | sha256sum -c -
tar -xzf "$tmp/$ASSET" -C "$tmp" pmtiles
install -m 0755 -o root -g root "$tmp/pmtiles" /usr/local/bin/pmtiles
pmtiles version
