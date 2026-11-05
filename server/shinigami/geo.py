"""Small geo helpers."""

import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6371008.8


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


@dataclass(frozen=True)
class Cell:
    id: str
    lat: float
    lon: float


def snap_cell(lat: float, lon: float, step: float = 0.1) -> Cell:
    """Snap to a grid cell centre; upstream calls use the centre, never raw GPS."""
    slat = round(round(lat / step) * step, 1) + 0.0
    slon = round(round(lon / step) * step, 1) + 0.0
    return Cell(id=f"{slat:.1f},{slon:.1f}", lat=slat, lon=slon)
