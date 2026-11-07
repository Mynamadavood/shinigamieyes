#!/usr/bin/env bash
# Dev PC (Git Bash): small CBD extract into var/tiles so the dev map has real tiles.
# Downloads the sha256-pinned go-pmtiles CLI into var/bin (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."

VER=1.31.2
BBOX=144.90,-37.85,145.02,-37.78
UA="ShinigamiEyes-tiles/1 (private)"
BASE="https://github.com/protomaps/go-pmtiles/releases/download/v${VER}"
mkdir -p var/bin var/tiles
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    asset="go-pmtiles_${VER}_Windows_x86_64.zip"
    sha=a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1; exe=var/bin/pmtiles.exe ;;
  *)
    asset="go-pmtiles_${VER}_Linux_x86_64.tar.gz"
    sha=3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f; exe=var/bin/pmtiles ;;
esac
if [ ! -x "$exe" ]; then
  curl -fsSL -A "$UA" -o "var/bin/$asset" "$BASE/$asset"
  echo "$sha  var/bin/$asset" | sha256sum -c -
  case "$asset" in
    *.zip) unzip -oq "var/bin/$asset" -d var/bin ;;
    *) tar -xzf "var/bin/$asset" -C var/bin ;;
  esac
fi

url=""
for i in $(seq 0 7); do
  d="$(date -u -d "-${i} day" +%Y%m%d)"
  if curl -sfI -A "$UA" --max-time 20 "https://build.protomaps.com/${d}.pmtiles" >/dev/null; then
    url="https://build.protomaps.com/${d}.pmtiles"; break
  fi
done
[ -n "$url" ] || { echo "no Protomaps build found" >&2; exit 1; }
"$exe" extract "$url" var/tiles/greater-melbourne.pmtiles --bbox="$BBOX" --maxzoom=15
ls -lh var/tiles/greater-melbourne.pmtiles
