"""Random points inside the municipality of Barcelos."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from generator.model import Hotspot

METRES_PER_DEGREE_LAT = 111_320.0


class Area:
    """The municipality polygon, prepared for fast point-in-polygon tests."""

    def __init__(self, geometry: BaseGeometry) -> None:
        self.geometry = geometry
        shapely.prepare(geometry)
        self.min_lng, self.min_lat, self.max_lng, self.max_lat = geometry.bounds

    @classmethod
    def from_geojson(cls, path: Path) -> Area:
        data = json.loads(path.read_text(encoding="utf-8"))
        features = data["features"] if data.get("type") == "FeatureCollection" else [data]
        geometries = [shape(f.get("geometry", f)) for f in features]
        return cls(shapely.union_all(geometries))

    def contains(self, lat: float, lng: float) -> bool:
        return bool(shapely.contains_xy(self.geometry, lng, lat))

    def uniform(self, rng: np.random.Generator) -> tuple[float, float]:
        """A point anywhere in the municipality (rejection sampling on the bounding box)."""
        while True:
            lat = rng.uniform(self.min_lat, self.max_lat)
            lng = rng.uniform(self.min_lng, self.max_lng)
            if self.contains(lat, lng):
                return lat, lng

    def near(
        self, rng: np.random.Generator, lat: float, lng: float, sigma_m: float
    ) -> tuple[float, float]:
        """A point normally distributed around (lat, lng), redrawn until it is inside."""
        metres_per_degree_lng = METRES_PER_DEGREE_LAT * math.cos(math.radians(lat))
        for _ in range(100):
            p_lat = lat + rng.normal(0, sigma_m) / METRES_PER_DEGREE_LAT
            p_lng = lng + rng.normal(0, sigma_m) / metres_per_degree_lng
            if self.contains(p_lat, p_lng):
                return p_lat, p_lng
        raise ValueError(f"O ponto ({lat}, {lng}) parece estar fora do concelho.")

    def hotspot(self, rng: np.random.Generator, spot: Hotspot) -> tuple[float, float]:
        return self.near(rng, spot.lat, spot.lng, spot.sigma_m)
