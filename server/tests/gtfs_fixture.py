"""Builds tiny nested GTFS zips for tests. All coordinates are synthetic test data.

Outer zip layout mirrors the PTV download: <n>/google_transit.zip. Nothing binary
is committed; zips are generated into tmp_path from the inline CSV rows below.
"""
from __future__ import annotations

import io
import zipfile
from pathlib import Path

URL = "https://transport.vic.gov.au/stop/{}/?utm_source=x"

# Synthetic base point (not a real address).
LAT0, LON0 = -37.0, 144.0

STOPS_HEAD = "stop_id,stop_name,stop_lat,stop_lon,stop_url,location_type,parent_station\n"
ROUTES_HEAD = "route_id,route_short_name\n"
TRIPS_HEAD = "route_id,trip_id,direction_id\n"
TIMES_HEAD = "trip_id,stop_id,stop_sequence\n"


def _inner(stops: str, routes: str, trips: str, times: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("stops.txt", "﻿" + STOPS_HEAD + stops)
        z.writestr("routes.txt", ROUTES_HEAD + routes)
        z.writestr("trips.txt", TRIPS_HEAD + trips)
        z.writestr("stop_times.txt", TIMES_HEAD + times)
    return buf.getvalue()


def _train() -> bytes:
    stops = (
        f"vic:S1,Alpha Station,{LAT0},{LON0},,1,\n"
        f"P1,Alpha Station Platform 1,{LAT0 + 0.0001},{LON0},{URL.format(1001)},0,vic:S1\n"
        f"P2,Alpha Station Platform 2,{LAT0 + 0.0001},{LON0 + 0.0001},{URL.format(1001)},0,vic:S1\n"
        f"R1,Alpha Rail Replacement Bus Stop,{LAT0 + 0.01},{LON0},{URL.format(1001)},0,\n"
    )
    return _inner(
        stops, "RT,Alpha Line\n", "RT,T1,0\nRT,T2,1\n", "T1,P1,1\nT2,P2,1\n"
    )


def _tram() -> bytes:
    stops = (
        f"T19499,Flinders St/Swanston St #13,{LAT0},{LON0},{URL.format(2204)},0,\n"
        f"T19685,Flinders St/Swanston St #13,{LAT0 + 0.0004},{LON0},{URL.format(2204)},0,\n"
    )
    return _inner(stops, "R96,96\n", "R96,TT1,1\nR96,TT2,0\n", "TT1,T19499,1\nTT2,T19685,1\n")


def _bus() -> bytes:
    stops = (
        f"B1,Elizabeth St/Lonsdale St,{LAT0},{LON0},{URL.format(3001)},0,\n"
        f"B2,Hardware St/Lonsdale St,{LAT0 + 0.0002},{LON0},{URL.format(3002)},0,\n"
        f"B3,Broken Stop,notanumber,{LON0},{URL.format(3003)},0,\n"
    )
    return _inner(stops, "R907,907\n", "R907,BT1,1\nR907,BT2,0\n", "BT1,B1,1\nBT2,B2,1\n")


def _regional() -> bytes:
    stops = f"V1,Regional Stop,{LAT0},{LON0},{URL.format(9999)},0,\n"
    return _inner(stops, "RV,V\n", "RV,VT1,0\n", "VT1,V1,1\n")


def build_gtfs_zip(dest: Path) -> Path:
    dest = Path(dest)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("1/google_transit.zip", _regional())
        z.writestr("2/google_transit.zip", _train())
        z.writestr("3/google_transit.zip", _tram())
        z.writestr("4/google_transit.zip", _bus())
    return dest
