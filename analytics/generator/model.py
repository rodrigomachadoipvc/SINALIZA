"""What the synthetic data looks like: categories, seasonality, hotspots and the texts used.

Every number here is an assumption chosen to make the dashboards tell a believable story; none of
it is measured from real Barcelos data.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date

import numpy as np

# Same slugs and names as DEFAULT_CATEGORIES in packages/shared/src/categories.ts.


@dataclass(frozen=True)
class CategoryModel:
    slug: str
    name: str
    icon: str
    share: float
    """Fraction of all reports, before seasonality."""
    resolution_days: tuple[float, float, float]
    """Triangular (min, mode, max) days from report to resolution."""
    hotspot_weights: dict[str, float] = field(default_factory=dict)
    """Relative weight of each hotspot; the remaining reports spread over the municipality."""
    in_progress_notes: tuple[str, ...] = ()
    resolved_notes: tuple[str, ...] = ()
    descriptions: tuple[str, ...] = ()


CATEGORIES: tuple[CategoryModel, ...] = (
    CategoryModel(
        "vias",
        "Vias e pavimento",
        "car",
        0.27,
        (7, 14, 30),
        {"centro": 0.15, "barcelinhos": 0.05, "industrial_norte": 0.12, "industrial_sul": 0.10},
        (
            "Pedido de reparação enviado à equipa de vias.",
            "Intervenção agendada com o empreiteiro.",
        ),
        ("Pavimento reparado.", "Buraco tapado com massa asfáltica."),
        (
            "Buraco grande na faixa de rodagem, perigoso para motas.",
            "Pavimento abatido junto à tampa de saneamento.",
            "Fissuras e alcatrão levantado depois das chuvas.",
            "Valeta entupida, a água corre pela estrada.",
            "Lomba danificada e com ferros à vista.",
        ),
    ),
    CategoryModel(
        "iluminacao",
        "Iluminação pública",
        "lightbulb",
        0.22,
        (3, 5, 10),
        {"centro": 0.20, "barcelinhos": 0.08, "industrial_norte": 0.04, "industrial_sul": 0.04},
        ("Pedido enviado à E-Redes.", "Equipa de iluminação destacada para o local."),
        ("Lâmpada substituída.", "Avaria no quadro elétrico reparada."),
        (
            "Candeeiro apagado há várias noites.",
            "Três candeeiros seguidos sem luz, a rua fica às escuras.",
            "Candeeiro a piscar durante toda a noite.",
            "Poste de iluminação inclinado depois do vento.",
            "Luz acesa durante o dia.",
        ),
    ),
    CategoryModel(
        "residuos",
        "Resíduos e limpeza",
        "trash-2",
        0.24,
        (1, 2, 5),
        {"centro": 0.30, "feira": 0.0, "barcelinhos": 0.06, "industrial_norte": 0.05},
        ("Pedido de recolha enviado aos serviços de limpeza.",),
        ("Recolha efetuada.", "Local limpo pelos serviços municipais."),
        (
            "Contentor cheio, lixo espalhado no chão.",
            "Monos abandonados junto ao ecoponto.",
            "Ecoponto do vidro a transbordar.",
            "Lixo deixado no fim da feira.",
            "Despejo ilegal de entulho na berma.",
        ),
    ),
    CategoryModel(
        "sinalizacao",
        "Sinalização",
        "signpost",
        0.11,
        (5, 9, 20),
        {"centro": 0.18, "barcelinhos": 0.06, "industrial_norte": 0.08, "industrial_sul": 0.08},
        ("Sinal encomendado.", "Pedido enviado à equipa de sinalização."),
        ("Sinal reposto.", "Marcas rodoviárias repintadas."),
        (
            "Sinal de STOP caído no cruzamento.",
            "Passadeira quase apagada à porta da escola.",
            "Sinal tapado pela vegetação.",
            "Semáforo avariado em amarelo intermitente.",
        ),
    ),
    CategoryModel(
        "passeios",
        "Passeios e acessibilidade",
        "accessibility",
        0.10,
        (10, 18, 45),
        {"centro": 0.35, "barcelinhos": 0.10},
        ("Intervenção incluída no plano de obras.",),
        ("Passeio reparado.", "Rebaixamento executado."),
        (
            "Pedras soltas no passeio, já houve quedas.",
            "Carros estacionados no passeio, não se passa com carrinho.",
            "Falta rebaixamento na passadeira para cadeiras de rodas.",
            "Raízes de árvore levantaram o passeio.",
        ),
    ),
    CategoryModel(
        "outro",
        "Outro",
        "ellipsis",
        0.06,
        (5, 10, 25),
        {"centro": 0.15},
        ("Pedido encaminhado para o serviço responsável.",),
        ("Situação resolvida.",),
        (
            "Árvore com ramos partidos sobre a estrada.",
            "Banco de jardim partido.",
            "Fuga de água no jardim público.",
            "Grafitis na parede da escola.",
        ),
    ),
)

CATEGORY_BY_SLUG = {c.slug: c for c in CATEGORIES}


@dataclass(frozen=True)
class Hotspot:
    lat: float
    lng: float
    sigma_m: float


# Approximate centres; points that fall outside the municipality polygon are drawn again.
HOTSPOTS: dict[str, Hotspot] = {
    "centro": Hotspot(41.5318, -8.6198, 450),
    "feira": Hotspot(41.5336, -8.6178, 120),  # Campo da República, the Thursday fair
    "barcelinhos": Hotspot(41.5262, -8.6252, 300),
    "industrial_norte": Hotspot(41.5480, -8.6050, 500),
    "industrial_sul": Hotspot(41.5150, -8.6000, 500),
}

# Outcomes besides the normal path to RESOLVIDA (fractions of all reports).
REJECTED_SHARE = 0.08
DUPLICATE_SHARE = 0.05
CANCELLED_SHARE = 0.02
# Normal reports that get stuck and take three times longer (feeds the backlog indicator).
STALLED_SHARE = 0.04

REJECTION_REASONS = (
    "A situação está em propriedade privada e não é da competência do município.",
    "A via é da responsabilidade da Infraestruturas de Portugal; o pedido foi reencaminhado.",
    "No local não foi encontrado o problema descrito.",
    "A descrição não permite identificar o problema; faça um novo pedido com mais detalhe.",
    "O pedido não diz respeito ao espaço público.",
)

CANCEL_NOTES = (None, None, "Já foi resolvido por um vizinho.", "Enganei-me na localização.")

# Share of reports per local hour (people report during the day and in the evening).
HOUR_WEIGHTS = np.array(
    [
        0.2,
        0.1,
        0.1,
        0.1,
        0.1,
        0.2,
        0.5,
        1.2,
        2.2,
        2.8,
        3.0,
        2.9,
        2.4,
        2.2,
        2.6,
        2.8,
        2.8,
        2.9,
        3.1,
        3.2,
        2.9,
        2.2,
        1.3,
        0.6,
    ]
)
HOUR_WEIGHTS = HOUR_WEIGHTS / HOUR_WEIGHTS.sum()

_WEEKDAY = (1.12, 1.05, 1.0, 1.08, 1.0, 0.78, 0.66)  # Monday … Sunday


def _yearly(day: date, peak_doy: int, amplitude: float) -> float:
    """1 ± amplitude, peaking on the given day of the year."""
    return 1 + amplitude * math.cos(2 * math.pi * (day.timetuple().tm_yday - peak_doy) / 365.25)


def rain_series(days: list[date], rng: np.random.Generator) -> np.ndarray:
    """Daily rain in mm: wet autumns and winters, dry summers (Minho climate, roughly)."""
    probability = np.array([0.12 + 0.43 * (_yearly(d, 15, 1) / 2) for d in days])
    amount = rng.gamma(shape=1.3, scale=7.0, size=len(days))
    rained: np.ndarray = (rng.random(len(days)) < probability) * amount
    return rained


def wetness(rain: np.ndarray) -> np.ndarray:
    """Rain of the three previous days, older days counting less: potholes open after the rain."""
    wet = np.zeros_like(rain)
    for lag, weight in ((1, 1.0), (2, 0.6), (3, 0.35)):
        wet[lag:] += weight * rain[:-lag]
    return wet


def daily_weight(category: CategoryModel, day: date, wet: float, progress: float) -> float:
    """Relative number of reports of a category on a day.

    `progress` goes from 0 (first day) to 1 (today): adoption grows over time.
    """
    weight = category.share * _WEEKDAY[day.weekday()] * (0.75 + 0.5 * progress)
    if category.slug == "iluminacao":
        weight *= _yearly(day, 1, 0.45)  # long nights in winter
    elif category.slug == "residuos":
        weight *= _yearly(day, 205, 0.30)  # summer
        if day.weekday() == 3:
            weight *= 1.7  # Thursday: Barcelos fair
    elif category.slug == "vias":
        weight *= 0.65 + 0.045 * min(wet, 25.0)
    return weight
