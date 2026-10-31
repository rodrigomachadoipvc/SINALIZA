import Supercluster from 'supercluster';

import type { MapPinView } from './types';

/** Visible area of the map: [west, south, east, north] in degrees, and a web-style zoom. */
export interface MapViewport {
  bbox: [number, number, number, number];
  zoom: number;
}

/** What the map draws: a single occurrence or a numbered bubble standing for several. */
export type MapItem =
  | { kind: 'pin'; pin: MapPinView }
  | { kind: 'cluster'; id: number; lat: number; lng: number; count: number; zoom: number };

// Pins closer than this merge into one bubble; from MAX_ZOOM on every pin shows. Supercluster
// measures the radius on 512 px tiles and our zoom levels use 256 px tiles, so 100 ≈ 50 px on screen.
const RADIUS_PX = 100;
const MAX_ZOOM = 17;
// The bbox sent to the API is padded and snapped to this grid, so small pans keep the same query
// key and reuse the cached response instead of fetching again.
const GRID_DEG = 0.02;

/** Zoom level shown by a react-native-maps region (inverse of `deltaForZoom`). */
export function zoomForDelta(longitudeDelta: number): number {
  return Math.log2(360 / Math.max(longitudeDelta, 1e-6));
}

export function viewportFromRegion(region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}): MapViewport {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  return {
    bbox: [
      region.longitude - halfLng,
      region.latitude - halfLat,
      region.longitude + halfLng,
      region.latitude + halfLat,
    ],
    zoom: zoomForDelta(region.longitudeDelta),
  };
}

/** `oeste,sul,este,norte` for `GET /map/occurrences`: half a screen of margin, snapped outwards. */
export function bboxParam([west, south, east, north]: MapViewport['bbox']): string {
  const padLng = (east - west) / 2;
  const padLat = (north - south) / 2;
  const down = (n: number) => Math.floor(n / GRID_DEG) * GRID_DEG;
  const up = (n: number) => Math.ceil(n / GRID_DEG) * GRID_DEG;
  const clamp = (n: number, limit: number) => Math.min(limit, Math.max(-limit, n));
  return [
    clamp(down(west - padLng), 180),
    clamp(down(south - padLat), 90),
    clamp(up(east + padLng), 180),
    clamp(up(north + padLat), 90),
  ]
    .map((n) => n.toFixed(2))
    .join(',');
}

export type PinIndex = Supercluster<{ pin: MapPinView }, Record<string, unknown>>;

/** Builds the spatial index once per set of pins; `clusterItems` then answers each viewport. */
export function buildPinIndex(pins: MapPinView[]): PinIndex {
  const index: PinIndex = new Supercluster({ radius: RADIUS_PX, maxZoom: MAX_ZOOM });
  return index.load(
    pins.map((pin) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
      properties: { pin },
    })),
  );
}

export function clusterItems(index: PinIndex, viewport: MapViewport): MapItem[] {
  return index.getClusters(viewport.bbox, Math.round(viewport.zoom)).map((feature) => {
    const [lng = 0, lat = 0] = feature.geometry.coordinates;
    const props = feature.properties;
    if ('cluster' in props) {
      const id = props.cluster_id;
      return {
        kind: 'cluster',
        id,
        lat,
        lng,
        count: props.point_count,
        zoom: Math.min(index.getClusterExpansionZoom(id), MAX_ZOOM + 1),
      };
    }
    return { kind: 'pin', pin: props.pin };
  });
}
