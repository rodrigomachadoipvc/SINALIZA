from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

import pandas as pd
import psycopg
import pytest

from common.config import ConfigError, database_url, load_env
from common.lake import SCHEMAS, upload, write_table
from export.extract import SOURCES, State, extract


def select_list(query: str) -> list[str]:
    """Output column names of `SELECT … FROM`, after `::cast` and `AS alias`."""
    body = re.search(r"SELECT(.*?)FROM", query, re.S)
    assert body
    names = []
    for item in body.group(1).split(","):
        item = item.strip()
        alias = re.search(r"\bAS\s+(\w+)$", item)
        names.append(alias.group(1) if alias else item.split("::")[0])
    return names


@pytest.mark.parametrize("source", SOURCES, ids=lambda s: s.table)
def test_queries_select_exactly_the_lake_columns(source: object) -> None:
    from export.extract import Source

    assert isinstance(source, Source)
    assert select_list(source.query) == SCHEMAS[source.table].names


def test_no_personal_data_leaves_the_database() -> None:
    for source in SOURCES:
        for column in ("citizen_name", "citizen_email", "description", "phone", "password"):
            assert column not in select_list(source.query)


def test_state_keeps_the_highest_timestamp(tmp_path: Path) -> None:
    state = State(tmp_path / "state.json")
    assert state.since("occurrences") is None
    frame = pd.DataFrame(
        {
            "updated_at": pd.to_datetime(
                ["2026-10-30T10:00:00Z", "2026-10-31T09:30:00.250Z"], format="ISO8601"
            )
        }
    )
    state.advance("occurrences", frame, "updated_at")
    state.advance("categories", frame.iloc[0:0], "updated_at")  # nothing new: no watermark
    state.save()

    again = State(tmp_path / "state.json")
    assert again.since("occurrences") == datetime(2026, 10, 31, 9, 30, 0, 250000, tzinfo=UTC)
    assert again.since("categories") is None


class FakeFiles:
    def __init__(self) -> None:
        self.calls: list[tuple[str, bytes, bool | None]] = []

    def upload(self, file_path: str, contents: BinaryIO, *, overwrite: bool | None = None) -> None:
        self.calls.append((file_path, contents.read(), overwrite))


def test_upload_keeps_the_table_folders(tmp_path: Path) -> None:
    at = pd.Timestamp("2026-10-31T12:00:00Z")
    frame = pd.DataFrame(
        {"id": ["c1"], "slug": ["vias"], "name": ["Vias"], "icon": ["car"], "active": [True],
         "created_at": [at], "updated_at": [at]}
    )  # fmt: skip
    path = write_table(frame, "categories", tmp_path, "20261031T120000Z")
    api = FakeFiles()

    targets = upload([path], tmp_path, api)

    expected = "/Volumes/sinaliza/bronze/landing/categories/categories-20261031T120000Z.parquet"
    assert targets == [expected]
    assert api.calls[0][0] == expected
    assert api.calls[0][1] == path.read_bytes()
    assert api.calls[0][2] is True


def test_database_url_matches_the_service_kit_rule() -> None:
    env = {
        "OCCURRENCE_DB_USER": "occ svc",
        "OCCURRENCE_DB_PASSWORD": "p@ss",
        "POSTGRES_PORT": "5433",
    }
    assert database_url(env, "OCCURRENCE", "occurrence_db") == (
        "postgresql://occ%20svc:p%40ss@localhost:5433/occurrence_db"
    )
    assert database_url({"OCCURRENCE_DATABASE_URL": "postgresql://x"}, "OCCURRENCE", "db") == (
        "postgresql://x"
    )
    with pytest.raises(ConfigError, match="OCCURRENCE_DB_USER"):
        database_url({}, "OCCURRENCE", "occurrence_db")


def _database_available() -> bool:
    try:
        env = load_env()
        with psycopg.connect(database_url(env, "OCCURRENCE", "occurrence_db"), connect_timeout=2):
            return True
    except (ConfigError, psycopg.OperationalError):
        return False


@pytest.mark.skipif(not _database_available(), reason="needs `docker compose up` and ../.env")
@pytest.mark.parametrize("source", SOURCES, ids=lambda s: s.table)
def test_extract_runs_against_the_local_databases(source: object, tmp_path: Path) -> None:
    from export.extract import Source

    assert isinstance(source, Source)
    future = datetime(2999, 1, 1, tzinfo=UTC)
    empty = extract(source, load_env(), future)
    assert list(empty.columns) == SCHEMAS[source.table].names
    assert empty.empty
