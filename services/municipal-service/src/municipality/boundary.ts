export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

interface PolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

type Geometry = MultiPolygonGeometry | PolygonGeometry;

function isGeometry(value: unknown): value is Geometry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { type?: unknown; coordinates?: unknown };
  return (v.type === 'Polygon' || v.type === 'MultiPolygon') && Array.isArray(v.coordinates);
}

/**
 * Extracts the boundary from a GeoJSON FeatureCollection, Feature or bare geometry and returns
 * it as a MultiPolygon (the column type), with its name when the feature has one.
 */
export function extractBoundary(geojson: unknown): {
  name?: string;
  geometry: MultiPolygonGeometry;
} {
  let candidate: unknown = geojson;
  let name: string | undefined;

  const asObject = (v: unknown): Record<string, unknown> =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

  if (asObject(candidate).type === 'FeatureCollection') {
    const features = asObject(candidate).features;
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error('GeoJSON FeatureCollection has no features');
    }
    candidate = features[0];
  }
  if (asObject(candidate).type === 'Feature') {
    const props = asObject(asObject(candidate).properties);
    if (typeof props.name === 'string') name = props.name;
    candidate = asObject(candidate).geometry;
  }
  if (!isGeometry(candidate)) {
    throw new Error('GeoJSON boundary must be a Polygon or MultiPolygon');
  }

  const geometry: MultiPolygonGeometry =
    candidate.type === 'Polygon'
      ? { type: 'MultiPolygon', coordinates: [candidate.coordinates] }
      : candidate;
  return name === undefined ? { geometry } : { name, geometry };
}
