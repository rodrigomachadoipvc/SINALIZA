"""Synthetic occurrences that walk the real state machine (packages/shared/src/state-machine.ts)."""

from __future__ import annotations

import re
import unicodedata
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from faker import Faker

from common.lake import Table
from generator.geo import Area
from generator.model import (
    CANCEL_NOTES,
    CANCELLED_SHARE,
    CATEGORIES,
    DUPLICATE_SHARE,
    HOTSPOTS,
    HOUR_WEIGHTS,
    REJECTED_SHARE,
    REJECTION_REASONS,
    STALLED_SHARE,
    CategoryModel,
    daily_weight,
    rain_series,
    wetness,
)

LISBON = ZoneInfo("Europe/Lisbon")
# Generated citizens use a reserved domain (RFC 2606 `.test`), so they are easy to find and remove.
CITIZEN_DOMAIN = "gerado.sinaliza.test"
GESTOR_COUNT = 4
DUPLICATE_WINDOW = timedelta(days=21)

OPEN = ("RECEBIDA", "EM_ANALISE", "EM_RESOLUCAO")


@dataclass(frozen=True)
class Options:
    count: int = 20_000
    start: date = date(2024, 1, 1)
    seed: int = 42
    now: datetime | None = None
    """Cut-off: nothing happens after it (defaults to the current time)."""


@dataclass(frozen=True)
class Dataset:
    occurrences: pd.DataFrame
    """Lake columns plus `citizen_name`, `citizen_email` and `description` (Postgres only)."""
    history: pd.DataFrame
    categories: pd.DataFrame


PRIVATE_COLUMNS = ("citizen_name", "citizen_email", "description")


@dataclass
class _Step:
    to: str
    at: datetime
    by_author: bool = False
    note: str | None = None
    reason: str | None = None


def category_id(slug: str) -> str:
    """Stable id for offline runs; `--load-postgres` swaps it for the municipal-service id."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"https://sinaliza.test/categories/{slug}"))


def _uuid(rng: np.random.Generator) -> str:
    return str(uuid.UUID(bytes=rng.bytes(16), version=4))


def _ms(t: datetime) -> datetime:
    """Postgres keeps milliseconds (timestamptz(3)); keep the same here."""
    return t.replace(microsecond=t.microsecond // 1000 * 1000)


def _email_part(name: str) -> str:
    ascii_name = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]+", ".", ascii_name.lower()).strip(".")


def working_time(t: datetime, rng: np.random.Generator) -> datetime:
    """Moves a staff action into working hours (weekdays, 08:30 to 18:00 in Lisbon)."""
    local = t.astimezone(LISBON)
    opening, closing = time(8, 30), time(18, 0)
    while local.weekday() >= 5 or local.time() >= closing:
        nxt = local.date() + timedelta(days=1)
        local = datetime.combine(nxt, opening, LISBON) + timedelta(
            minutes=float(rng.uniform(0, 90))
        )
    if local.time() < opening:
        local = datetime.combine(local.date(), opening, LISBON) + timedelta(
            minutes=float(rng.uniform(0, 90))
        )
    return local.astimezone(UTC)


def _days(n: float) -> timedelta:
    return timedelta(days=n)


class _Simulator:
    def __init__(self, options: Options, area: Area) -> None:
        self.o = options
        self.area = area
        self.rng = np.random.default_rng(options.seed)
        self.fake = Faker("pt_PT")
        self.fake.seed_instance(options.seed)
        self.now = _ms(options.now or datetime.now(UTC))
        self.gestores = [_uuid(self.rng) for _ in range(GESTOR_COUNT)]
        self._citizens()

    def _citizens(self) -> None:
        n = max(50, self.o.count // 7)
        self.citizens = []
        for i in range(n):
            name = f"{self.fake.first_name()} {self.fake.last_name()}"
            email = f"{_email_part(name)}.{i + 1}@{CITIZEN_DOMAIN}"
            self.citizens.append((_uuid(self.rng), name, email))
        # A few people report a lot, most report once or twice.
        weights = 1 / np.arange(1, n + 1) ** 0.9
        self.citizen_weights = weights / weights.sum()

    def _when(self) -> list[tuple[datetime, CategoryModel]]:
        """How many reports of each category on each day, and at what time."""
        today = self.now.astimezone(LISBON).date()
        days = [self.o.start + timedelta(days=i) for i in range((today - self.o.start).days + 1)]
        wet = wetness(rain_series(days, self.rng))
        span = max(1, len(days) - 1)
        weights = np.array(
            [
                [daily_weight(c, d, float(wet[i]), i / span) for c in CATEGORIES]
                for i, d in enumerate(days)
            ]
        )
        counts = self.rng.poisson(weights / weights.sum() * self.o.count)
        reports: list[tuple[datetime, CategoryModel]] = []
        for i, day in enumerate(days):
            for j, category in enumerate(CATEGORIES):
                for _ in range(int(counts[i, j])):
                    hour = int(self.rng.choice(24, p=HOUR_WEIGHTS))
                    seconds = float(self.rng.uniform(0, 3600))
                    local = datetime.combine(day, time(hour), LISBON) + timedelta(seconds=seconds)
                    created = _ms(local.astimezone(UTC))
                    if created <= self.now:
                        reports.append((created, category))
        reports.sort(key=lambda r: r[0])
        return reports

    def _location(self, category: CategoryModel, created: datetime) -> tuple[float, float]:
        weights = dict(category.hotspot_weights)
        if category.slug == "residuos" and created.astimezone(LISBON).weekday() == 3:
            weights["feira"] = 0.35
        roll = float(self.rng.random())
        for name, weight in weights.items():
            if roll < weight:
                return self.area.hotspot(self.rng, HOTSPOTS[name])
            roll -= weight
        return self.area.uniform(self.rng)

    def _pick(self, options: tuple[str, ...]) -> str:
        return options[int(self.rng.integers(len(options)))]

    def _normal(self, created: datetime, category: CategoryModel) -> list[_Step]:
        rng = self.rng
        analysis = working_time(created + timedelta(hours=float(rng.uniform(1, 48))), rng)
        low, mode, high = category.resolution_days
        days = float(rng.triangular(low, mode, high))
        if rng.random() < STALLED_SHARE:
            days *= 3
        target = created + _days(days)
        # Each step moves forward from the previous one, so the order holds after snapping.
        share = (target - analysis) * float(rng.uniform(0.15, 0.6))
        started = working_time(analysis + max(timedelta(hours=2), share), rng)
        resolved = working_time(
            max(target, started + timedelta(hours=float(rng.uniform(2, 8)))), rng
        )
        return [
            _Step("EM_ANALISE", analysis),
            _Step("EM_RESOLUCAO", started, note=self._pick(category.in_progress_notes)),
            _Step("RESOLVIDA", resolved, note=self._pick(category.resolved_notes)),
        ]

    def _closed_by_staff(self, created: datetime, to: str, max_days: float) -> list[_Step]:
        rng = self.rng
        steps: list[_Step] = []
        at = created
        if rng.random() < 0.4:
            at = working_time(created + timedelta(hours=float(rng.uniform(1, 48))), rng)
            steps.append(_Step("EM_ANALISE", at))
        closed = working_time(at + timedelta(hours=float(rng.uniform(2, 24 * max_days))), rng)
        reason = self._pick(REJECTION_REASONS) if to == "REJEITADA" else None
        steps.append(_Step(to, closed, reason=reason))
        return steps

    def run(self) -> Dataset:
        rng = self.rng
        recent: dict[str, deque[tuple[datetime, str, float, float]]] = defaultdict(deque)
        occurrences: list[dict[str, Any]] = []
        history: list[dict[str, Any]] = []

        for created, category in self._when():
            oid = _uuid(rng)
            citizen_id, citizen_name, citizen_email = self.citizens[
                int(rng.choice(len(self.citizens), p=self.citizen_weights))
            ]
            window = recent[category.slug]
            while window and window[0][0] < created - DUPLICATE_WINDOW:
                window.popleft()

            roll = float(rng.random())
            original: tuple[datetime, str, float, float] | None = None
            if roll < CANCELLED_SHARE:
                outcome = "ANULADA"
            elif roll < CANCELLED_SHARE + REJECTED_SHARE:
                outcome = "REJEITADA"
            elif roll < CANCELLED_SHARE + REJECTED_SHARE + DUPLICATE_SHARE and window:
                outcome = "DUPLICADA"
                original = window[int(rng.integers(len(window)))]
            else:
                outcome = "RESOLVIDA"

            if original:
                lat, lng = self.area.near(rng, original[2], original[3], 35)
            else:
                lat, lng = self._location(category, created)

            if outcome == "ANULADA":
                at = created + timedelta(minutes=float(rng.uniform(10, 30 * 60)))
                note = CANCEL_NOTES[int(rng.integers(len(CANCEL_NOTES)))]
                steps = [_Step("ANULADA", at, by_author=True, note=note)]
            elif outcome == "RESOLVIDA":
                steps = self._normal(created, category)
                window.append((created, oid, lat, lng))
            else:
                steps = self._closed_by_staff(created, outcome, 5 if outcome == "REJEITADA" else 3)

            done = [replace(s, at=_ms(s.at)) for s in steps if s.at <= self.now]
            status = done[-1].to if done else "RECEBIDA"
            last = {s.to: s for s in done}
            occurrences.append(
                {
                    "id": oid,
                    "reference": None,
                    "citizen_id": citizen_id,
                    "citizen_name": citizen_name,
                    "citizen_email": citizen_email,
                    "category_id": category_id(category.slug),
                    "category_slug": category.slug,
                    "category_name": category.name,
                    "description": self._pick(category.descriptions),
                    "status": status,
                    "lat": round(lat, 6),
                    "lng": round(lng, 6),
                    "address": f"{self.fake.street_name()}, Barcelos",
                    "has_photo": False,
                    "original_id": original[1] if original and "DUPLICADA" in last else None,
                    "rejection_reason": last["REJEITADA"].reason if "REJEITADA" in last else None,
                    "created_at": created,
                    "updated_at": done[-1].at if done else created,
                    "resolved_at": last["RESOLVIDA"].at if "RESOLVIDA" in last else None,
                    "cancelled_at": last["ANULADA"].at if "ANULADA" in last else None,
                }
            )
            history.append(
                {
                    "id": _uuid(rng),
                    "occurrence_id": oid,
                    "from_status": None,
                    "to_status": "RECEBIDA",
                    "note": None,
                    "reason": None,
                    "changed_by": citizen_id,
                    "changed_by_role": "CIDADAO",
                    "changed_at": created,
                }
            )
            previous = "RECEBIDA"
            for step in done:
                history.append(
                    {
                        "id": _uuid(rng),
                        "occurrence_id": oid,
                        "from_status": previous,
                        "to_status": step.to,
                        "note": step.note,
                        "reason": step.reason,
                        "changed_by": citizen_id
                        if step.by_author
                        else self.gestores[int(rng.integers(GESTOR_COUNT))],
                        "changed_by_role": "CIDADAO" if step.by_author else "GESTOR",
                        "changed_at": step.at,
                    }
                )
                previous = step.to

        start = datetime.combine(self.o.start, time(0), UTC)
        categories = pd.DataFrame(
            [
                {
                    "id": category_id(c.slug),
                    "slug": c.slug,
                    "name": c.name,
                    "icon": c.icon,
                    "active": True,
                    "created_at": start,
                    "updated_at": start,
                }
                for c in CATEGORIES
            ]
        )
        dataset = Dataset(pd.DataFrame(occurrences), pd.DataFrame(history), categories)
        return assign_references(dataset, {})[0]


def simulate(options: Options, area: Area) -> Dataset:
    return _Simulator(options, area).run()


def assign_references(
    dataset: Dataset, last_values: dict[int, int]
) -> tuple[Dataset, dict[int, int]]:
    """Numbers the occurrences SIN-YYYY-NNNNN in creation order, after the given counters.

    Returns the dataset and the new last value per year. Duplicates get a note naming the original.
    """
    occ = dataset.occurrences.sort_values("created_at", kind="stable").reset_index(drop=True)
    counters = dict(last_values)
    references: list[str] = []
    for created in occ["created_at"]:
        year = pd.Timestamp(created).tz_convert(LISBON).year
        counters[year] = counters.get(year, 0) + 1
        references.append(f"SIN-{year}-{counters[year]:05d}")
    occ["reference"] = references

    by_id = dict(zip(occ["id"], occ["reference"], strict=True))
    history = dataset.history.copy()
    duplicate_of = dict(zip(occ["id"], occ["original_id"], strict=True))
    is_duplicate = history["to_status"] == "DUPLICADA"
    history.loc[is_duplicate, "note"] = [
        f"Já reportada em {by_id[duplicate_of[oid]]}."
        for oid in history.loc[is_duplicate, "occurrence_id"]
    ]
    return replace(dataset, occurrences=occ, history=history), counters


def with_categories(dataset: Dataset, ids: dict[str, tuple[str, str]]) -> Dataset:
    """Uses the real category ids and names (slug → (id, name)) from the municipal-service."""
    missing = sorted(set(dataset.categories["slug"]) - set(ids))
    if missing:
        raise ValueError(
            f"Categorias em falta na municipal_db: {', '.join(missing)}. "
            "Arranque o municipal-service."
        )
    occ = dataset.occurrences.copy()
    occ["category_id"] = occ["category_slug"].map(lambda s: ids[s][0])
    occ["category_name"] = occ["category_slug"].map(lambda s: ids[s][1])
    categories = dataset.categories.copy()
    categories["id"] = categories["slug"].map(lambda s: ids[s][0])
    categories["name"] = categories["slug"].map(lambda s: ids[s][1])
    return replace(dataset, occurrences=occ, categories=categories)


def lake_frames(dataset: Dataset) -> dict[Table, pd.DataFrame]:
    """The frames written to Parquet, without the private columns."""
    return {
        "occurrences": dataset.occurrences.drop(columns=list(PRIVATE_COLUMNS)),
        "status_history": dataset.history,
        "categories": dataset.categories,
    }


def summary(dataset: Dataset) -> dict[str, Any]:
    occ = dataset.occurrences
    statuses = occ["status"].value_counts().to_dict()
    return {
        "occurrences": len(occ),
        "history": len(dataset.history),
        "from": str(occ["created_at"].min()),
        "to": str(occ["created_at"].max()),
        "statuses": {k: int(v) for k, v in statuses.items()},
        "open": int(occ["status"].isin(OPEN).sum()),
        "categories": {k: int(v) for k, v in occ["category_slug"].value_counts().to_dict().items()},
    }
