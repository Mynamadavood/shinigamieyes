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


def test_geocode_expires_after_ttl(tmp_path):
    from shinigami.store import GEOCODE_TTL_S, Store

    s = Store(tmp_path / "g.db")
    s.put_geocode("q", [{"name": "n"}], 1000.0)
    assert s.get_geocode("q", 1000.0 + GEOCODE_TTL_S) == [{"name": "n"}]
    assert s.get_geocode("q", 1000.0 + GEOCODE_TTL_S + 1) is None


def test_geocode_put_prunes_expired_rows_from_disk(tmp_path):
    from shinigami.store import GEOCODE_TTL_S, Store

    s = Store(tmp_path / "g.db")
    s.put_geocode("old", [], 1000.0)
    s.put_geocode("new", [], 1000.0 + GEOCODE_TTL_S + 5)
    rows = {r[0] for r in s._db().execute("SELECT q_norm FROM geocode_cache")}
    assert rows == {"new"}
    assert s.get_geocode("old") is None


def test_geocode_capped_to_newest_rows(tmp_path, monkeypatch):
    import shinigami.store as st

    monkeypatch.setattr(st, "GEOCODE_MAX_ROWS", 3)
    s = st.Store(tmp_path / "g.db")
    for i in range(5):
        s.put_geocode(f"q{i}", [], 1000.0 + i)
    rows = {r[0] for r in s._db().execute("SELECT q_norm FROM geocode_cache")}
    assert rows == {"q2", "q3", "q4"}
    assert len(s._geo) == 3


def test_prune_layers_by_prefix_and_age(tmp_path):
    p = tmp_path / "s.db"
    s = Store(p)
    s.put_layer("transit", "pat:old", {"a": 1}, 100.0)
    s.put_layer("transit", "pat:new", {"a": 2}, 500.0)
    s.put_layer("transit", "dep:1", {"a": 3}, 100.0)
    s.put_layer("other", "pat:old", {"a": 4}, 100.0)
    s.put_layer("transit", "patx", {"a": 5}, 100.0)  # prefix is literal, not a LIKE pattern
    assert s.prune_layers("transit", "pat:", 200.0) == 1
    assert s.get_layer("transit", "pat:old") is None
    assert s.get_layer("transit", "pat:new") == ({"a": 2}, 500.0)
    assert s.get_layer("transit", "dep:1") is not None
    assert s.get_layer("other", "pat:old") is not None
    assert s.get_layer("transit", "patx") is not None
    s.close()
    s2 = Store(p)  # gone from disk too, not just from the in-memory layer
    assert s2.get_layer("transit", "pat:old") is None
    s2.close()
