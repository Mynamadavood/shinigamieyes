"""Weekly job: PTV GTFS Schedule zip -> transit_stops.json (metro train, tram, bus).

Stdlib only. Needs no PTV key (D-22). Prints counts only, never coordinates or ids.
Outer zip folders 2/3/4 only; V/Line and regional folders are ignored.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import shutil
import tempfile
import time
import zipfile
from pathlib import Path

SOURCE = "PTV GTFS Schedule (CC BY 4.0)"
FOLDERS = {"2": "train", "3": "tram", "4": "bus"}
MIN_KEEP_RATIO = 0.8
_STOP_RE = re.compile(r"/stop/(\d+)/")


def _rows(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))


def _build_mode(inner_path: Path, mode: str, skipped: list[int]) -> list[dict]:
    with zipfile.ZipFile(inner_path) as zf:
        route_short = {}
        for r in _rows(zf, "routes.txt"):
            route_short[r["route_id"]] = r.get("route_short_name") or r["route_id"]
        trip_key = {}
        for t in _rows(zf, "trips.txt"):
            short = route_short.get(t["route_id"], t["route_id"])
            trip_key[t["trip_id"]] = (short, t.get("direction_id") or "0")
        stop_dirs: dict[str, set[str]] = {}
        stop_routes: dict[str, set[str]] = {}
        for st in _rows(zf, "stop_times.txt"):
            k = trip_key.get(st["trip_id"])
            if k is None:
                continue
            stop_dirs.setdefault(st["stop_id"], set()).add(f"{k[0]}:{k[1]}")
            stop_routes.setdefault(st["stop_id"], set()).add(k[0])
        all_rows = {}
        for s in _rows(zf, "stops.txt"):
            all_rows[s["stop_id"]] = s

    recs: dict[int, dict] = {}
    for sid, s in all_rows.items():
        try:
            m = _STOP_RE.search(s.get("stop_url") or "")
            if not m:
                continue
            if "replacement" in (s.get("stop_name") or "").lower():
                continue
            ptv = int(m.group(1))
            pos = s
            if mode == "train" and s.get("parent_station") in all_rows:
                pos = all_rows[s["parent_station"]]
            lat, lon = float(pos["stop_lat"]), float(pos["stop_lon"])
            name = (pos.get("stop_name") or "").strip()
            if not name:
                continue
            rec = recs.setdefault(
                ptv,
                {"id": ptv, "mode": mode, "name": name, "poles": [], "gtfs_ids": [], "routes": set()},
            )
            dirs = stop_dirs.get(sid, set())
            pole_pos = [round(lat, 6), round(lon, 6)]
            existing = next((p for p in rec["poles"] if p[0] == pole_pos[0] and p[1] == pole_pos[1]), None)
            if existing is not None:
                existing[2] = sorted(set(existing[2]) | dirs)
            else:
                rec["poles"].append([pole_pos[0], pole_pos[1], sorted(dirs)])
            rec["gtfs_ids"].append(sid)
            rec["routes"] |= stop_routes.get(sid, set())
        except Exception:  # noqa: BLE001 - one bad row must not stop the weekly refresh
            skipped[0] += 1
    out = []
    for ptv in sorted(recs):
        r = recs[ptv]
        r["gtfs_ids"] = sorted(r["gtfs_ids"])
        r["routes"] = sorted(r["routes"])
        r["poles"].sort()
        out.append(r)
    return out


def build_stops(input_zip: Path) -> tuple[list[dict], dict]:
    input_zip = Path(input_zip)
    skipped = [0]
    records: list[dict] = []
    counts = {"train": 0, "tram": 0, "bus": 0}
    tmpdir = Path(tempfile.mkdtemp(prefix="transit-", dir=str(input_zip.parent)))
    try:
        with zipfile.ZipFile(input_zip) as outer:
            for folder, mode in FOLDERS.items():
                member = f"{folder}/google_transit.zip"  # fixed member name, never a path from the zip
                tmp = tmpdir / f"{mode}.zip"
                with outer.open(member) as src, open(tmp, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                recs = _build_mode(tmp, mode, skipped)
                tmp.unlink()
                counts[mode] = len(recs)
                records.extend(recs)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    counts["skipped"] = skipped[0]
    return records, counts


def _existing_count(path: Path) -> int | None:
    try:
        return len(json.loads(path.read_text(encoding="utf-8"))["stops"])
    except (OSError, ValueError, KeyError, TypeError):
        return None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--force", action="store_true", help="replace even if the dataset shrank a lot")
    a = ap.parse_args(argv)
    records, counts = build_stops(Path(a.input))
    out = Path(a.output)
    new_n, old_n = len(records), _existing_count(out)
    if not a.force and (new_n == 0 or (old_n and new_n < old_n * MIN_KEEP_RATIO)):
        print(f"REFUSED: new={new_n} old={old_n}; kept the existing file (use --force to override)")
        return 1
    data = {"version": 1, "built_at": time.time(), "source": SOURCE, "stops": records}
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, out)
    print("train={train} tram={tram} bus={bus} skipped={skipped}".format(**counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
