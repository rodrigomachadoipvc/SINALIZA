import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useMemo } from 'react';
import { View } from 'react-native';
import { MapContainer, Marker, Polygon, TileLayer, useMapEvents } from 'react-leaflet';

import { OSM_TILES } from '../config';
import { colors, statusColors } from '../theme/tokens';
import { boundaryRings, type LatLng, type SinalizaMapProps } from './types';

function dotIcon(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
  });
}

function ClickToMove({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Web build of the map (development checks in a browser): Leaflet with the same OSM tiles. */
export function SinalizaMap({
  center,
  zoom,
  accessibilityLabel,
  boundary,
  pins = [],
  onPinPress,
  marker,
  onMarkerChange,
  interactive = true,
  style,
}: SinalizaMapProps) {
  const rings = useMemo(() => (boundary ? boundaryRings(boundary) : []), [boundary]);
  return (
    <View style={[{ overflow: 'hidden' }, style]} accessibilityLabel={accessibilityLabel}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        dragging={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        zoomControl={interactive}
        attributionControl
      >
        <TileLayer url={OSM_TILES} maxZoom={19} attribution="© colaboradores do OpenStreetMap" />
        {rings.map((ring, i) => (
          <Polygon
            key={i}
            positions={ring.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: colors.azul,
              weight: 2,
              dashArray: '6 4',
              fillOpacity: 0.04,
              interactive: false,
            }}
          />
        ))}
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={dotIcon(statusColors[p.status], 22)}
            title={p.label}
            alt={p.label}
            keyboard
            eventHandlers={onPinPress ? { click: () => onPinPress(p.id) } : {}}
          />
        ))}
        {marker ? (
          <Marker
            position={[marker.lat, marker.lng]}
            icon={dotIcon(colors.amarelo, 30)}
            draggable={Boolean(onMarkerChange)}
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = (e.target as L.Marker).getLatLng();
                onMarkerChange?.({ lat, lng });
              },
            }}
          />
        ) : null}
        {onMarkerChange ? <ClickToMove onChange={onMarkerChange} /> : null}
      </MapContainer>
    </View>
  );
}
