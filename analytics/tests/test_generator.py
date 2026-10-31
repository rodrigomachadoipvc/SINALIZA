from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pandas as pd
import pytest

from common.config import BOUNDARY_FILE
from common.lake import SCHEMAS, read_table, write_table
from generator.geo import Area
from generator.model import CATEGORY_BY_SLUG
from generator.simulate import (
    LISBON,
    PRIVATE_COLUMNS,
    Dataset,
    Options,
    assign_references,
    lake_frames,
    simulate,
)

NOW = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)

# Same rules as TRANSITION_RULES in packages/shared/src/state-machine.ts.
ALLOWED = {
    ("", "RECEBIDA"),
    ("RECEBIDA", "EM_ANALISE"),
    ("RECEBIDA", "REJEITADA"),
    ("EM_ANALISE", "REJEITADA"),
    ("RECEBIDA", "DUPLICADA"),
    ("EM_ANALISE", "DUPLICADA"),
    ("EM_ANALISE", "EM_RESOLUCAO"),
    ("EM_RESOLUCAO", "RESOLVIDA"),
    ("RECEBIDA", "ANULADA"),
}


@pytest.fixture(scope="module")
def area() -> Area:
    return Area.from_geojson(BOUNDARY_FILE)


@pytest.fixture(scope="module")
def data(area: Area) -> Dataset:
    return simulate(Options(count=8000, start=date(2024, 1, 1), seed=7, now=NOW), area)


def test_points_are_inside_barcelos(data: Dataset, area: Area) -> None:
    occ = data.occurrences
    assert all(area.contains(lat, lng) for lat, lng in zip(occ["lat"], occ["lng"], strict=True))


def test_volume_and_period(data: Dataset) -> None:
    occ = data.occurrences
    assert 7500 < len(occ) < 8500
    assert occ["created_at"].min() >= pd.Timestamp("2024-01-01", tz=LISBON)
    assert occ["created_at"].max() <= NOW


def test_history_walks_the_state_machine(data: Dataset) -> None:
    history = data.history.sort_values(["occurrence_id", "changed_at"], kind="stable")
    pairs = set(zip(history["from_status"].fillna(""), history["to_status"], strict=True))
    assert pairs <= ALLOWED
    last = history.groupby("occurrence_id")["to_status"].last()
    status = data.occurrences.set_index("id")["status"]
    assert (last.reindex(status.index) == status).all()
    first = history.groupby("occurrence_id")["changed_at"].first()
    created = data.occurrences.set_index("id")["created_at"]
    assert (first.reindex(created.index) == created).all()


def test_outcome_shares(data: Dataset) -> None:
    shares = data.occurrences["status"].value_counts(normalize=True)
    assert 0.06 < shares["REJEITADA"] < 0.10
    assert 0.035 < shares["DUPLICADA"] < 0.065
    assert 0.01 < shares["ANULADA"] < 0.03
    assert shares["RESOLVIDA"] > 0.7


def test_resolution_times_follow_the_category(data: Dataset) -> None:
    occ = data.occurrences[data.occurrences["status"] == "RESOLVIDA"]
    days = (occ["resolved_at"] - occ["created_at"]).dt.total_seconds() / 86400
    for slug, group in days.groupby(occ["category_slug"]):
        low, _, high = CATEGORY_BY_SLUG[str(slug)].resolution_days
        # Working hours push a little past the range; stalled ones take up to three times longer.
        assert group.quantile(0.5) >= low
        assert group.quantile(0.5) <= high
        assert group.max() <= high * 3 + 4
    lighting = days[occ["category_slug"] == "iluminacao"].median()
    roads = days[occ["category_slug"] == "vias"].median()
    assert lighting < roads


def test_seasonality(data: Dataset) -> None:
    occ = data.occurrences
    local = occ["created_at"].dt.tz_convert(LISBON)
    month = local.dt.month
    lighting = occ["category_slug"] == "iluminacao"
    winter = (lighting & month.isin([12, 1])).sum()
    summer = (lighting & month.isin([6, 7])).sum()
    assert winter > summer * 1.5

    waste = occ[occ["category_slug"] == "residuos"]
    weekday = waste["created_at"].dt.tz_convert(LISBON).dt.day_of_week
    per_day = weekday.value_counts()
    assert per_day[3] > per_day.drop(3).max()  # Thursday fair


def test_duplicates_point_to_an_earlier_report_nearby(data: Dataset) -> None:
    occ = data.occurrences.set_index("id")
    dups = occ[occ["status"] == "DUPLICADA"]
    assert dups["original_id"].notna().all()
    originals = occ.loc[dups["original_id"]]
    assert (originals["category_slug"].to_numpy() == dups["category_slug"].to_numpy()).all()
    assert (originals["created_at"].to_numpy() < dups["created_at"].to_numpy()).all()
    assert not originals["status"].isin(["DUPLICADA", "ANULADA"]).any()
    assert ((originals["lat"].to_numpy() - dups["lat"].to_numpy()) ** 2 < 0.002**2).all()


def test_staff_act_in_working_hours(data: Dataset) -> None:
    staff = data.history[data.history["changed_by_role"] == "GESTOR"]
    local = staff["changed_at"].dt.tz_convert(LISBON)
    assert (local.dt.day_of_week < 5).all()
    minutes = local.dt.hour * 60 + local.dt.minute
    assert minutes.between(8 * 60 + 30, 18 * 60).mean() > 0.99


def test_open_occurrences_are_recent_or_stalled(data: Dataset) -> None:
    occ = data.occurrences
    open_ = occ[occ["status"].isin(["RECEBIDA", "EM_ANALISE", "EM_RESOLUCAO"])]
    assert len(open_) > 0
    assert (open_["created_at"] > NOW - timedelta(days=150)).all()


def test_references_are_sequential_per_year(data: Dataset) -> None:
    refs = data.occurrences["reference"]
    assert refs.is_unique
    first = data.occurrences.groupby(data.occurrences["created_at"].dt.tz_convert(LISBON).dt.year)
    assert first["reference"].first().tolist() == [
        "SIN-2024-00001",
        "SIN-2025-00001",
        "SIN-2026-00001",
    ]
    numbered, counters = assign_references(data, {2026: 482})
    assert numbered.occurrences["reference"].str.startswith("SIN-2026-00483").any()
    assert counters[2026] == 482 + (data.occurrences["reference"].str[4:8] == "2026").sum()
    note = numbered.history.loc[numbered.history["to_status"] == "DUPLICADA", "note"].iloc[0]
    assert str(note).startswith("Já reportada em SIN-")


def test_same_seed_same_data(area: Area) -> None:
    options = Options(count=300, start=date(2026, 1, 1), seed=3, now=NOW)
    a, b = simulate(options, area), simulate(options, area)
    pd.testing.assert_frame_equal(a.occurrences, b.occurrences)


def test_lake_files_leave_out_personal_data(data: Dataset, tmp_path: Path) -> None:
    frames = lake_frames(data)
    for column in PRIVATE_COLUMNS:
        assert column not in frames["occurrences"].columns
    for table, frame in frames.items():
        path = write_table(frame, table, tmp_path, "20261031T120000Z")
        assert path == tmp_path / table / f"{table}-20261031T120000Z.parquet"
        back = read_table(path)
        assert list(back.columns) == SCHEMAS[table].names
        assert len(back) == len(frame)


def test_write_table_rejects_unknown_columns(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="citizen_email"):
        write_table(pd.DataFrame({"id": ["x"], "citizen_email": ["a@b.c"]}), "occurrences",
                    tmp_path, "s")  # fmt: skip
