"""The notebooks cannot run here (they need Databricks), but their format, Python and SQL can be
checked: a malformed source file would import as plain text, and a SQL typo would only show up in
the nightly job."""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
import sqlglot
import yaml

from common.config import ANALYTICS_DIR

NOTEBOOKS = sorted((ANALYTICS_DIR / "notebooks").glob("*.py"))
HEADER = "# Databricks notebook source"
SEPARATOR = "# COMMAND ----------"


@dataclass(frozen=True)
class Cell:
    kind: str  # "python", "md" or "sql"
    source: str


def cells(path: Path) -> list[Cell]:
    text = path.read_text(encoding="utf-8")
    assert text.startswith(HEADER + "\n"), f"{path.name}: falta o cabeçalho"
    result = []
    for chunk in text[len(HEADER) :].split(SEPARATOR):
        lines = chunk.strip("\n").splitlines()
        if not lines:
            continue
        if all(line.startswith("# MAGIC") for line in lines):
            body = [line.removeprefix("# MAGIC").removeprefix(" ") for line in lines]
            magic, *rest = body
            kind = magic.strip().removeprefix("%")
            result.append(Cell(kind, "\n".join(rest)))
        else:
            assert not any(line.startswith("# MAGIC") for line in lines), (
                f"{path.name}: célula com linhas MAGIC misturadas com Python"
            )
            result.append(Cell("python", "\n".join(lines)))
    return result


def test_the_six_notebooks_exist() -> None:
    assert [p.stem for p in NOTEBOOKS] == [
        "00_setup",
        "01_bronze_ingestao",
        "02_silver_limpeza",
        "03_gold_indicadores",
        "04_otimizacao_e_governanca",
        "05_consultas_dashboard",
    ]


@pytest.mark.parametrize("path", NOTEBOOKS, ids=lambda p: p.stem)
def test_notebook_format(path: Path) -> None:
    parsed = cells(path)
    assert parsed[0].kind == "md" and parsed[0].source.startswith("# "), "abre com um título"
    assert {c.kind for c in parsed} <= {"python", "md", "sql"}
    for cell in parsed:
        if cell.kind == "python":
            ast.parse(cell.source, filename=path.name)


@pytest.mark.parametrize("path", NOTEBOOKS, ids=lambda p: p.stem)
def test_sql_cells_parse_as_databricks_sql(path: Path) -> None:
    for cell in cells(path):
        if cell.kind != "sql":
            continue
        try:
            statements = sqlglot.parse(cell.source, read="databricks")
        except sqlglot.errors.SqlglotError as error:
            pytest.fail(f"{path.name}: SQL inválido:\n{cell.source}\n{error}")
        assert all(statements), f"{path.name}: célula SQL vazia"


@pytest.mark.parametrize("path", NOTEBOOKS, ids=lambda p: p.stem)
def test_notebooks_use_the_catalog_widget(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    assert 'dbutils.widgets.text("catalog", "sinaliza"' in text
    # Names validated before going into DDL.
    assert 're.fullmatch(r"[a-z_][a-z0-9_]*", catalog)' in text


def test_silver_has_quality_rules_and_change_data_feed() -> None:
    text = (ANALYTICS_DIR / "notebooks" / "02_silver_limpeza.py").read_text(encoding="utf-8")
    assert text.count("delta.enableChangeDataFeed = true") >= 3
    assert "MERGE INTO silver.occurrences" in text
    assert "h3_longlatash3(lng, lat, 9)" in text
    assert len(re.findall(r"ADD CONSTRAINT \w+\s+(?:# MAGIC\s+)?CHECK", text)) >= 7


def bundle() -> dict[str, Any]:
    data: dict[str, Any] = yaml.safe_load((ANALYTICS_DIR / "databricks.yml").read_text("utf-8"))
    return data


def test_bundle_runs_bronze_silver_gold_daily() -> None:
    job = bundle()["resources"]["jobs"]["lakehouse_diario"]
    tasks = {t["task_key"]: t for t in job["tasks"]}
    assert list(tasks) == ["bronze", "silver", "gold"]
    assert "depends_on" not in tasks["bronze"]
    assert tasks["silver"]["depends_on"] == [{"task_key": "bronze"}]
    assert tasks["gold"]["depends_on"] == [{"task_key": "silver"}]
    for task in tasks.values():
        assert (ANALYTICS_DIR / task["notebook_task"]["notebook_path"]).is_file()
    assert job["schedule"]["timezone_id"] == "Europe/Lisbon"
    assert job["max_concurrent_runs"] == 1
    assert bundle()["targets"]["dev"]["default"] is True
