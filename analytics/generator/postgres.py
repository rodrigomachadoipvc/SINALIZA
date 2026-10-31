"""`--load-postgres`: writes the generated data into occurrence_db, like the TypeScript seed does.

Rows go in directly (the API cannot backdate occurrences or their history), so no events are
published and no emails are sent. Everything runs in one transaction: either all rows land, the
reference counters move past them and every point is inside the cached boundary, or nothing does.
"""

from __future__ import annotations

from collections.abc import Mapping

import pandas as pd
import psycopg

from common.config import database_url
from generator.simulate import CITIZEN_DOMAIN, Dataset, assign_references, with_categories

OCCURRENCE_COLUMNS = (
    "id", "reference", "citizen_id", "citizen_name", "citizen_email", "category_id",
    "category_name", "category_slug", "description", "status", "location", "address",
    "original_id", "rejection_reason", "created_at", "updated_at", "resolved_at", "cancelled_at",
)  # fmt: skip
HISTORY_COLUMNS = (
    "id", "occurrence_id", "from_status", "to_status", "note", "reason", "changed_by",
    "changed_by_role", "changed_at",
)  # fmt: skip

GENERATED = f"%@{CITIZEN_DOMAIN}"


class LoadError(RuntimeError):
    pass


def _value(v: object) -> object:
    return None if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT else v


def municipal_categories(env: Mapping[str, str]) -> dict[str, tuple[str, str]]:
    with psycopg.connect(database_url(env, "MUNICIPAL", "municipal_db")) as conn:
        rows = conn.execute("SELECT slug, id::text, name FROM categories").fetchall()
    return {slug: (cid, name) for slug, cid, name in rows}


def count_generated(conn: psycopg.Connection) -> int:
    row = conn.execute(
        "SELECT count(*) FROM occurrences WHERE citizen_email LIKE %s", (GENERATED,)
    ).fetchone()
    return int(row[0]) if row else 0


def purge(env: Mapping[str, str]) -> int:
    """Deletes the generated occurrences (their history goes with them, ON DELETE CASCADE).

    Generated duplicates point to generated originals, so they are deleted first.

    The load numbered the generated occurrences right after the counter of each year, so the
    counter goes back to just before the first generated number — or stays at the highest number
    still in use if real reports came after. It never goes lower: numbers of deleted occurrences
    may already be in emails and are not handed out again.
    """
    with psycopg.connect(database_url(env, "OCCURRENCE", "occurrence_db")) as conn:
        conn.execute("LOCK TABLE reference_counters IN EXCLUSIVE MODE")
        before = conn.execute(
            """
            SELECT split_part(reference, '-', 2)::int AS year,
                   min(split_part(reference, '-', 3)::int) - 1 AS last_before
            FROM occurrences WHERE citizen_email LIKE %s
            GROUP BY 1
            """,
            (GENERATED,),
        ).fetchall()
        dups = conn.execute(
            "DELETE FROM occurrences WHERE citizen_email LIKE %s AND original_id IS NOT NULL",
            (GENERATED,),
        ).rowcount
        rest = conn.execute(
            "DELETE FROM occurrences WHERE citizen_email LIKE %s", (GENERATED,)
        ).rowcount
        with conn.cursor() as cur:
            cur.executemany(
                """
                UPDATE reference_counters c SET last_value = greatest(%(last_before)s, coalesce((
                  SELECT max(split_part(o.reference, '-', 3)::int) FROM occurrences o
                  WHERE o.reference LIKE 'SIN-' || c.year || '-%%'
                ), 0))
                WHERE c.year = %(year)s
                """,
                [{"year": year, "last_before": last} for year, last in before],
            )
            # Years the load created and nobody else used (a missing row means 0 anyway).
            cur.execute("DELETE FROM reference_counters WHERE last_value = 0")
    return dups + rest


def load(dataset: Dataset, env: Mapping[str, str], replace_existing: bool) -> Dataset:
    """Inserts the dataset and returns it with the references actually used."""
    dataset = with_categories(dataset, municipal_categories(env))
    if replace_existing:
        purge(env)

    with psycopg.connect(database_url(env, "OCCURRENCE", "occurrence_db")) as conn:
        existing = count_generated(conn)
        if existing:
            raise LoadError(
                f"Já existem {existing} ocorrências geradas. Use --replace para as substituir."
            )
        cached = conn.execute("SELECT count(*) FROM boundary_cache").fetchone()
        if not cached or cached[0] == 0:
            raise LoadError(
                "O limite do concelho ainda não está em cache. Arranque o occurrence-service."
            )

        # Lock the counters so a citizen reporting right now cannot take one of our numbers.
        conn.execute("LOCK TABLE reference_counters IN EXCLUSIVE MODE")
        rows = conn.execute("SELECT year, last_value FROM reference_counters").fetchall()
        dataset, counters = assign_references(dataset, {int(y): int(v) for y, v in rows})

        with conn.cursor() as cur:
            occ = dataset.occurrences
            with cur.copy(f"COPY occurrences ({', '.join(OCCURRENCE_COLUMNS)}) FROM STDIN") as copy:
                for r in occ.to_dict("records"):
                    r["location"] = f"SRID=4326;POINT({r['lng']} {r['lat']})"
                    copy.write_row([_value(r[c]) for c in OCCURRENCE_COLUMNS])
            with cur.copy(f"COPY status_history ({', '.join(HISTORY_COLUMNS)}) FROM STDIN") as copy:
                for h in dataset.history.to_dict("records"):
                    copy.write_row([_value(h[c]) for c in HISTORY_COLUMNS])

            outside = cur.execute(
                """
                SELECT count(*) FROM occurrences o
                WHERE o.citizen_email LIKE %s AND NOT EXISTS (
                  SELECT 1 FROM boundary_cache b
                  WHERE ST_Contains(b.boundary, o.location::geometry)
                )
                """,
                (GENERATED,),
            ).fetchone()
            if outside and outside[0]:
                raise LoadError(f"{outside[0]} pontos ficaram fora do concelho; nada foi gravado.")

            cur.executemany(
                """
                INSERT INTO reference_counters (year, last_value) VALUES (%s, %s)
                ON CONFLICT (year) DO UPDATE
                  SET last_value = GREATEST(reference_counters.last_value, EXCLUDED.last_value)
                """,
                sorted(counters.items()),
            )
    return dataset
