"""Static checks on deploy scripts and units (no SSH, no systemd: text only)."""

import re
from pathlib import Path

DEPLOY = Path(__file__).resolve().parents[2] / "deploy"


def _text(name: str) -> str:
    return (DEPLOY / name).read_text(encoding="utf-8")


def test_transit_download_is_bounded():
    # review WR-S8: no download timeout meant a stalled transfer hung the deploy forever
    sh = _text("refresh-transit.sh")
    for flag in (
        "--proto '=https'",
        "--proto-redir '=https'",
        "--connect-timeout",
        "--max-time",
        "--speed-limit",
        "--speed-time",
        "--max-filesize",
    ):
        assert flag in sh, flag


def test_transit_unit_has_start_timeout():
    unit = _text("shinigami-transit.service")
    assert re.search(r"^Type=oneshot$", unit, re.MULTILINE)
    assert re.search(r"^TimeoutStartSec=\d+min$", unit, re.MULTILINE)


def test_first_transit_build_wait_is_bounded():
    sh = _text("deploy.sh")
    starts = [ln for ln in sh.splitlines() if "systemctl start shinigami-transit" in ln]
    assert starts and all(re.search(r"\btimeout \d+m systemctl start", ln) for ln in starts)
