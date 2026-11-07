import httpx
import pytest
from shinigami.main import create_app
from shinigami.settings import Settings


class FakeRuntime:
    def __init__(self) -> None:
        self.requests: list[tuple[str, object]] = []

    def request_cell(self, provider_id, cell) -> None:
        self.requests.append((provider_id, cell))


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        static_dir=tmp_path / "dist",
        db_path=tmp_path / "t.db",
        places_path=tmp_path / "places.toml",
        tiles_path=tmp_path / "tiles" / "t.pmtiles",
        cameras_path=tmp_path / "cameras.json",
    )


@pytest.fixture
def app(settings):
    return create_app(settings, start_runtime=False)


@pytest.fixture
def fake_runtime(app) -> FakeRuntime:
    rt = FakeRuntime()
    app.state.ctx.runtime = rt
    return rt


@pytest.fixture
def client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def frozen_now() -> float:
    """2026-11-05T06:00:00Z as epoch seconds."""
    return 1793858400.0
