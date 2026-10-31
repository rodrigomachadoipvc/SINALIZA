"""The Parquet files that land in the Bronze volume, shared by the generator and the export.

Both write the same columns, so the notebooks do not care where a file came from. Data minimisation:
the lake keeps the citizen's pseudonymous id only, never their name, email or the free-text
description they typed (the dashboards do not need them).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO, Literal, Protocol

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from common.config import LANDING_VOLUME, DatabricksSettings

Table = Literal["occurrences", "status_history", "categories"]
TABLES: tuple[Table, ...] = ("occurrences", "status_history", "categories")

_TS = pa.timestamp("ms", tz="UTC")

SCHEMAS: dict[Table, pa.Schema] = {
    "occurrences": pa.schema(
        [
            ("id", pa.string()),
            ("reference", pa.string()),
            ("citizen_id", pa.string()),
            ("category_id", pa.string()),
            ("category_slug", pa.string()),
            ("category_name", pa.string()),
            ("status", pa.string()),
            ("lat", pa.float64()),
            ("lng", pa.float64()),
            ("address", pa.string()),
            ("has_photo", pa.bool_()),
            ("original_id", pa.string()),
            ("rejection_reason", pa.string()),
            ("created_at", _TS),
            ("updated_at", _TS),
            ("resolved_at", _TS),
            ("cancelled_at", _TS),
        ]
    ),
    "status_history": pa.schema(
        [
            ("id", pa.string()),
            ("occurrence_id", pa.string()),
            ("from_status", pa.string()),
            ("to_status", pa.string()),
            ("note", pa.string()),
            ("reason", pa.string()),
            ("changed_by", pa.string()),
            ("changed_by_role", pa.string()),
            ("changed_at", _TS),
        ]
    ),
    "categories": pa.schema(
        [
            ("id", pa.string()),
            ("slug", pa.string()),
            ("name", pa.string()),
            ("icon", pa.string()),
            ("active", pa.bool_()),
            ("created_at", _TS),
            ("updated_at", _TS),
        ]
    ),
}


def batch_stamp(now: datetime | None = None) -> str:
    """`20261031T120000Z`: sortable and unique per run, so Auto Loader sees each batch as new."""
    return (now or datetime.now(UTC)).strftime("%Y%m%dT%H%M%SZ")


def write_table(frame: pd.DataFrame, table: Table, out_dir: Path, stamp: str) -> Path:
    """Writes `<out_dir>/<table>/<table>-<stamp>.parquet`; the columns must match the schema."""
    schema = SCHEMAS[table]
    if set(frame.columns) != set(schema.names):
        unknown = sorted(set(frame.columns) - set(schema.names))
        missing = sorted(set(schema.names) - set(frame.columns))
        raise ValueError(f"{table}: colunas a mais {unknown}, em falta {missing}")
    arrow = pa.Table.from_pandas(frame[schema.names], schema=schema, preserve_index=False)
    path = out_dir / table / f"{table}-{stamp}.parquet"
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(arrow, path, compression="zstd")
    return path


def read_table(path: Path) -> pd.DataFrame:
    frame: pd.DataFrame = pq.read_table(path).to_pandas()
    return frame


class FilesApi(Protocol):
    def upload(
        self, file_path: str, contents: BinaryIO, *, overwrite: bool | None = None
    ) -> object: ...


def files_api(settings: DatabricksSettings) -> FilesApi:
    from databricks.sdk import WorkspaceClient  # imported lazily: only needed when uploading

    client = WorkspaceClient(host=settings.host, token=settings.token, product="sinaliza-analytics")
    return client.files


def upload(files: Iterable[Path], out_dir: Path, api: FilesApi) -> list[str]:
    """Copies the files to the landing volume, keeping their `<table>/<file>` layout."""
    uploaded: list[str] = []
    for file in files:
        target = f"{LANDING_VOLUME}/{file.relative_to(out_dir).as_posix()}"
        with file.open("rb") as contents:
            api.upload(target, contents, overwrite=True)
        uploaded.append(target)
    return uploaded
