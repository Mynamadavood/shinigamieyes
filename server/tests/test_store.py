from shinigami.store import Store


def test_layer_roundtrip_and_persistence(tmp_path):
    p = tmp_path / "s.db"
    s = Store(p)
    assert s.get_layer("x", "c") is None
    s.put_layer("x", "c", {"a": 1}, 123.0)
    assert s.get_layer("x", "c") == ({"a": 1}, 123.0)
    s.close()
    s2 = Store(p)
    assert s2.get_layer("x", "c") == ({"a": 1}, 123.0)
    s2.close()


def test_geocode_roundtrip(tmp_path):
    s = Store(tmp_path / "s.db")
    assert s.get_geocode("q") is None
    s.put_geocode("q", [{"name": "n"}], 5.0)
    assert s.get_geocode("q") == [{"name": "n"}]
    s.close()
    s2 = Store(tmp_path / "s.db")
    assert s2.get_geocode("q") == [{"name": "n"}]
    s2.close()


def test_wal(tmp_path):
    s = Store(tmp_path / "sub" / "s.db")
    assert s.journal_mode().lower() == "wal"
    s.close()
