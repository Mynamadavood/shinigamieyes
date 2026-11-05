"""Generate black PNG icons with two blood-red square eyes (stdlib only)."""

import struct
import zlib
from pathlib import Path

RED = (0xE0, 0x20, 0x2A)
BLACK = (0, 0, 0)
OUT = Path(__file__).resolve().parents[1] / "web" / "public"


def chunk(tag: bytes, data: bytes) -> bytes:
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def png(size: int, safe: float) -> bytes:
    # two eyes inside the central `safe` fraction of the canvas
    span = size * safe
    margin = (size - span) / 2
    eye = span * 0.28
    y0 = size / 2 - eye / 2
    xs = [margin + span * 0.12, margin + span * 0.88 - eye]
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            in_eye = y0 <= y < y0 + eye and any(a <= x < a + eye for a in xs)
            row += bytes(RED if in_eye else BLACK)
        rows.append(bytes(row))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, safe in [
        ("apple-touch-icon-180.png", 180, 0.9),
        ("icon-192.png", 192, 0.9),
        ("icon-512.png", 512, 0.9),
        ("icon-512-maskable.png", 512, 0.8),
    ]:
        (OUT / name).write_bytes(png(size, safe))
        print("wrote", name)


if __name__ == "__main__":
    main()
