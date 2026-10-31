import { type OccurrenceStatus, STATUS_LABELS } from '@sinaliza/shared';
import L from 'leaflet';
import type { ReactNode } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';

import { useMunicipality } from '../api/queries';
import { STATUS_HEX } from '../components/StatusBadge';

export const BARCELOS_CENTER: [number, number] = [41.535, -8.62];

const BOUNDARY_STYLE = {
  color: '#1A2B4C',
  weight: 2,
  dashArray: '6 4',
  fill: true,
  fillColor: '#1A2B4C',
  fillOpacity: 0.04,
};

/** OpenStreetMap tiles with the municipality boundary (from the municipal-service). */
export function BaseMap({
  children,
  center = BARCELOS_CENTER,
  zoom = 11,
  className = 'h-[560px]',
  label,
}: {
  children?: ReactNode;
  center?: [number, number];
  zoom?: number;
  className?: string;
  label: string;
}) {
  const municipality = useMunicipality();
  return (
    <div role="region" aria-label={label} className={`overflow-hidden rounded-cartao ${className}`}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="size-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">contribuidores do OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {municipality.data ? (
          <GeoJSON data={municipality.data.boundary} style={BOUNDARY_STYLE} interactive={false} />
        ) : null}
        {children}
      </MapContainer>
    </div>
  );
}

const iconCache = new Map<OccurrenceStatus, L.DivIcon>();

/** Map pin in the colour of the status, with an outline so it reads on any tile. */
export function pinIcon(status: OccurrenceStatus): L.DivIcon {
  let icon = iconCache.get(status);
  if (!icon) {
    const color = STATUS_HEX[status];
    icon = L.divIcon({
      className: 'sinaliza-pin',
      iconSize: [28, 36],
      iconAnchor: [14, 36],
      popupAnchor: [0, -32],
      html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36" width="28" height="36" role="img" aria-label="${STATUS_LABELS[status]}"><path d="M14 35C9 27 2 21 2 13a12 12 0 0 1 24 0c0 8-7 14-12 22Z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13" r="4.5" fill="#fff"/></svg>`,
    });
    iconCache.set(status, icon);
  }
  return icon;
}
