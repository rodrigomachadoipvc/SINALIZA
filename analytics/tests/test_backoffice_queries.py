"""The occurrence-service sends these queries to Databricks; notebook 05 shows the same text, so
what the backoffice displays can be reproduced (and debugged) in the workspace."""

from __future__ import annotations

import re

from common.config import ANALYTICS_DIR, REPO_ROOT
from tests.test_notebooks import cells

QUERIES_TS = (
    REPO_ROOT / "services" / "occurrence-service" / "src" / "stats" / "databricks-queries.ts"
)


def normalise(sql: str) -> str:
    return re.sub(r"\s+", " ", sql).strip()


def backoffice_queries() -> list[str]:
    """The SQL template literals in databricks-queries.ts."""
    text = QUERIES_TS.read_text(encoding="utf-8")
    return re.findall(r"=\s*`\s*(SELECT.*?)`", text, re.S)


def test_backoffice_queries_are_the_ones_in_notebook_05() -> None:
    queries = backoffice_queries()
    assert len(queries) == 6
    notebook = [
        normalise(c.source)
        for c in cells(ANALYTICS_DIR / "notebooks" / "05_consultas_dashboard.py")
        if c.kind == "sql"
    ]
    for query in queries:
        assert normalise(query) in notebook, f"consulta do backoffice fora do notebook 05:\n{query}"
