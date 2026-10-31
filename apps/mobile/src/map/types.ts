import type { OccurrenceStatus } from '@sinaliza/shared';
import type { StyleProp, ViewStyle } from 'react-native';

import type { Municipality } from '../api/types';
import type { MapViewport } from './cluster';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapPinView {
  id: string;
  lat: number;
  lng: number;
  status: OccurrenceStatus;
  /** Read by screen readers («Iluminação pública, Recebida, SIN-…»). */
  label: string;
}

export interface SinalizaMapProps {
  center: LatLng;
  zoom: number;
  accessibilityLabel: string;
  boundary?: Municipality['boundary'] | undefined;
  pins?: MapPinView[];
  onPinPress?: (id: string) => void;
  /** Called when the user stops panning or zooming, with the area now visible. */
  onViewportChange?: (viewport: MapViewport) => void;
  /** A single pin (report step 3); draggable when `onMarkerChange` is given. */
  marker?: LatLng | null;
  onMarkerChange?: (position: LatLng) => void;
  /** Static mini map (detail screen): no panning or zooming. */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Shared default, so an absent `pins` prop does not rebuild the cluster index on every render. */
export const NO_PINS: MapPinView[] = [];

/** GeoJSON MultiPolygon → outer rings as lat/lng lists. */
export function boundaryRings(boundary: Municipality['boundary']): LatLng[][] {
  return boundary.coordinates.map((polygon) =>
    (polygon[0] ?? []).map(([lng = 0, lat = 0]) => ({ lat, lng })),
  );
}

/** Approximate span of the visible area for a web-style zoom level. */
export function deltaForZoom(zoom: number): number {
  return 360 / 2 ** zoom;
}
