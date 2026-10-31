"""Settings shared by the generator and the export, read from the repository's `.env`."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

ANALYTICS_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = ANALYTICS_DIR.parent
OUTPUT_DIR = ANALYTICS_DIR / "output"
BOUNDARY_FILE = REPO_ROOT / "infra" / "geo" / "barcelos.geojson"

# Unity Catalog names fixed by the specification (section 9).
CATALOG = "sinaliza"
LANDING_VOLUME = f"/Volumes/{CATALOG}/bronze/landing"


def load_env() -> Mapping[str, str]:
    """Loads `../.env` if it exists (real environment variables win) and returns the environment."""
    load_dotenv(REPO_ROOT / ".env", override=False)
    return os.environ


class ConfigError(RuntimeError):
    """A required setting is missing."""


def require(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        raise ConfigError(f"Falta a variável {name} (veja analytics/README.md e .env.example).")
    return value


def database_url(env: Mapping[str, str], prefix: str, database: str) -> str:
    """Same rule as `databaseUrl` in @sinaliza/service-kit, with `<PREFIX>_DATABASE_URL` winning."""
    explicit = env.get(f"{prefix}_DATABASE_URL", "").strip()
    if explicit:
        return explicit
    user = quote(require(env, f"{prefix}_DB_USER"), safe="")
    password = quote(require(env, f"{prefix}_DB_PASSWORD"), safe="")
    host = env.get("DB_HOST", "localhost")
    port = env.get("POSTGRES_PORT", "5432")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


@dataclass(frozen=True)
class DatabricksSettings:
    host: str
    token: str


def databricks_settings(env: Mapping[str, str]) -> DatabricksSettings:
    return DatabricksSettings(
        host=require(env, "DATABRICKS_HOST").rstrip("/"),
        token=require(env, "DATABRICKS_TOKEN"),
    )
