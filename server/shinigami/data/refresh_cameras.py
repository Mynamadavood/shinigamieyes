"""Weekly job: Geofabrik Victoria PBF -> cameras.json (CCTV, speed, red-light).

Privacy rules (PROVISIONAL decision 2, David to confirm in 02-14):
- surveillance:type=guard (a person) is never emitted.
- operator is kept only for public bodies; dropped when uncertain.
- no name field is ever emitted; output prints counts only, never coordinates.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path

SOURCE = "OpenStreetMap contributors (ODbL) via Geofabrik"

_WORDS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]
_COMPASS = {
    "N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5, "E": 90, "ESE": 112.5, "SE": 135, "SSE": 157.5,
    "S": 180, "SSW": 202.5, "SW": 225, "WSW": 247.5, "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5,
}
_PUBLIC_RE = re.compile(
    r"council|city of|shire|department|government|victoria police|vicroads|"
    r"public transport victoria|metro trains|yarra trams|v/line",
    re.IGNORECASE,
)


def direction_words(raw):
    if raw is None:
        return None
    token = str(raw).split(";")[0].strip()
    if not token:
        return None
    deg = _COMPASS.get(token.upper())
    if deg is None:
        try:
            deg = float(token)
        except ValueError:
            return None
    return _WORDS[int(round((deg % 360) / 45)) % 8]


def public_operator(tags):
    op = tags.get("operator")
    if not op:
        return None
    optype = tags.get("operator:type")
    if optype in ("public", "government"):
        return op
    if optype:
        return None
    return op if _PUBLIC_RE.search(op) else None


def enforcement_kind(value):
    if value == "traffic_signals":
        return "redlight"
    if value in ("maxspeed", "average_speed"):
        return "speed"
    return None


def _base(node_id, lat, lon, kind):
    return {"id": f"n{node_id}", "k": kind, "lat": round(float(lat), 6), "lon": round(float(lon), 6)}


def cctv_record(node_id, lat, lon, tags):
    if tags.get("man_made") != "surveillance" or tags.get("surveillance:type") == "guard":
        return None
    rec = _base(node_id, lat, lon, "cctv")
    if tags.get("camera:type"):
        rec["camera_type"] = tags["camera:type"]
    d = direction_words(tags.get("camera:direction") or tags.get("direction"))
    if d:
        rec["direction"] = d
    op = public_operator(tags)
    if op:
        rec["operator"] = op
    if tags.get("surveillance") in ("public", "outdoor", "indoor"):
        rec["surveillance"] = tags["surveillance"]
    if tags.get("addr:suburb"):
        rec["suburb"] = tags["addr:suburb"]
    return rec


def road_record(node_id, lat, lon, tags, kind=None):
    k = kind or enforcement_kind(tags.get("enforcement")) or "speed"
    rec = _base(node_id, lat, lon, k)
    if tags.get("addr:suburb"):
        rec["suburb"] = tags["addr:suburb"]
    return rec


def build(path):
    import osmium

    device_kind: dict[int, str] = {}

    class Rels(osmium.SimpleHandler):
        def relation(self, r):
            if r.tags.get("type") != "enforcement":
                return
            kind = enforcement_kind(r.tags.get("enforcement"))
            if kind is None:
                return
            for m in r.members:
                if m.type == "n" and m.role in ("device", ""):
                    device_kind[m.ref] = kind

    Rels().apply_file(str(path))

    cameras: list[dict] = []
    road_ids: set[int] = set()

    class Nodes(osmium.SimpleHandler):
        def node(self, n):
            if not n.location.valid():
                return
            tags = n.tags
            lat, lon = n.location.lat, n.location.lon
            rec = cctv_record(n.id, lat, lon, tags)
            if rec:
                cameras.append(rec)
            if tags.get("highway") == "speed_camera" or n.id in device_kind:
                cameras.append(road_record(n.id, lat, lon, tags, device_kind.get(n.id)))
                road_ids.add(n.id)

    Nodes().apply_file(str(path))

    roads: dict[int, str] = {}

    class Ways(osmium.SimpleHandler):
        def way(self, w):
            name = w.tags.get("name")
            if not name or "highway" not in w.tags:
                return
            for nd in w.nodes:
                if nd.ref in road_ids and nd.ref not in roads:
                    roads[nd.ref] = name

    if road_ids:
        Ways().apply_file(str(path))
    for c in cameras:
        if c["k"] != "cctv":
            r = roads.get(int(c["id"][1:]))
            if r:
                c["road"] = r
    return {"version": 1, "built_at": time.time(), "source": SOURCE, "cameras": cameras}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    a = ap.parse_args(argv)
    data = build(a.input)
    out = Path(a.output)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, out)
    counts = {k: sum(1 for c in data["cameras"] if c["k"] == k) for k in ("cctv", "speed", "redlight")}
    print("cctv={cctv} speed={speed} redlight={redlight}".format(**counts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
