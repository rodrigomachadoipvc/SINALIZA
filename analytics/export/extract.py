"""Incremental extract of the operational tables into the lake's Parquet layout.

Each table has a watermark (the highest `updated_at`, or `changed_at` for the append-only history)
kept in `output/export/state.json`. A run reads the rows at or after the watermark: rows on the
boundary come again, which is harmless because Silver merges by `id` and keeps the latest version.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pandas as pd
import psycopg
from psycopg.rows import dict_row

from common.config import database_url
from common.lake import Table


@dataclass(frozen=True)
class Source:
    table: Table
    prefix: str
    database: str
    watermark: str
    query: str


# Lake columns only: no citizen name, email or description (see common/lake.py).
SOURCES: tuple[Source, ...] = (
    Source(
        "occurrences",
        "OCCURRENCE",
        "occurrence_db",
        "updated_at",
        """
        SELECT id::text, reference, citizen_id::text, category_id::text, category_slug,
               category_name, status::text, lat, lng, address, photo_key IS NOT NULL AS has_photo,
               original_id::text, rejection_reason, created_at, updated_at, resolved_at,
               cancelled_at
        FROM occurrences
        WHERE %(since)s::timestamptz IS NULL OR updated_at >= %(since)s::timestamptz
        ORDER BY updated_at, id
        """,
    ),
    Source(
        "status_history",
        "OCCURRENCE",
        "occurrence_db",
        "changed_at",
        """
        SELECT id::text, occurrence_id::text, from_status::text, to_status::text, note, reason,
               changed_by::text, changed_by_role::text, changed_at
        FROM status_history
        WHERE %(since)s::timestamptz IS NULL OR changed_at >= %(since)s::timestamptz
        ORDER BY changed_at, id
        """,
    ),
    Source(
        "categories",
        "MUNICIPAL",
        "municipal_db",
        "updated_at",
        """
        SELECT id::text, slug, name, icon, active, created_at, updated_at
        FROM categories
        WHERE %(since)s::timestamptz IS NULL OR updated_at >= %(since)s::timestamptz
        ORDER BY updated_at, id
        """,
    ),
)


class State:
    """Watermarks per table, stored as ISO 8601 strings."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.values: dict[str, str] = (
            json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        )

    def since(self, table: str) -> datetime | None:
        value = self.values.get(table)
        return datetime.fromisoformat(value) if value else None

    def advance(self, table: str, frame: pd.DataFrame, column: str) -> None:
        if not frame.empty:
            self.values[table] = pd.Timestamp(frame[column].max()).isoformat()

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.values, indent=2) + "\n", encoding="utf-8")


def extract(source: Source, env: Mapping[str, str], since: datetime | None) -> pd.DataFrame:
    with (
        psycopg.connect(database_url(env, source.prefix, source.database)) as conn,
        conn.cursor(row_factory=dict_row) as cur,
    ):
        cur.execute(source.query, {"since": since})
        rows = cur.fetchall()
        columns = [c.name for c in cur.description or []]
    return pd.DataFrame(rows, columns=columns)
