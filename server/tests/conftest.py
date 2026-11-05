import httpx
import pytest
from shinigami.main import create_app
from shinigami.settings import Settings


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(
        static_dir=tmp_path / "dist",
        db_path=tmp_path / "t.db",
        places_path=tmp_path / "places.toml",
    )


@pytest.fixture
def app(settings):
    return create_app(settings)


@pytest.fixture
def client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def frozen_now() -> float:
    """2026-11-05T06:00:00Z as epoch seconds."""
    return 1793858400.0
