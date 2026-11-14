"""Signing vectors use the FAKE all-zero key and devid 1000001 only (RESEARCH, openssl cross-checked)."""

from shinigami.transit.ptv_client import BASE_URL, sign_path

DEVID = "1000001"
KEY = "00000000-0000-0000-0000-000000000000"

VECTORS = [
    ("/v3/route_types", "6F409F877AFDAC161D72FF50A977789DC11FC30A"),
    (
        "/v3/stops/location/-37.8136,144.9631?route_types=1&max_distance=800&max_results=10",
        "3CBCFCAAD4E49A23034FFCCFB481DE7EB3AEFCF8",
    ),
    (
        ("/v3/departures/route_type/1/stop/2720?max_results=20&expand=Run&expand=Route"
        "&expand=Direction&expand=Disruption&expand=VehiclePosition"),
        "2E233A9C90E8356BC38C8FAD87DE980DE11EE99F",
    ),
]


def test_three_vectors_exact():
    for path, sig in VECTORS:
        sep = "&" if "?" in path else "?"
        assert sign_path(path, DEVID, KEY) == f"{BASE_URL}{path}{sep}devid={DEVID}&signature={sig}"


def test_signature_is_uppercase_hex_and_last():
    url = sign_path("/v3/route_types", DEVID, KEY)
    sig = url.rsplit("&signature=", 1)[1]
    assert sig == sig.upper() and len(sig) == 40
