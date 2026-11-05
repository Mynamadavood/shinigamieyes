"""Runtime settings (env prefix SHINIGAMI_)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SHINIGAMI_", env_file=".env", extra="ignore")

    static_dir: Path = REPO_ROOT / "web" / "dist"
    db_path: Path = REPO_ROOT / "var" / "shinigami.db"
    places_path: Path = REPO_ROOT / "var" / "places.toml"
    contact_email: str = ""
    default_lat: float = -37.8136
    default_lon: float = 144.9631
    version: str = "0.1.0"


@lru_cache
def get_settings() -> Settings:
    return Settings()
