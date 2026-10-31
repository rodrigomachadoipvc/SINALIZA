import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet';

import { OSM_TILES } from '../config';
import { t } from '../i18n/pt-PT';
import { colors, statusColors } from '../theme/tokens';
import { buildPinIndex, clusterItems, type MapItem, type MapViewport } from './cluster';
import { boundaryRings, type LatLng, NO_PINS, type SinalizaMapProps } from './types';

function dotIcon(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>`,
  });
}

function clusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 36 : count < 100 ? 44 : 52;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${colors.azul};color:#fff;font:600 12px sans-serif;border:3px solid #fff;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.4)">${count}</span>`,
  });
}

function viewportOf(map: L.Map): MapViewport {
  const b = map.getBounds();
  return { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() };
}

/** Clusters the pins for the visible area, like the native map. */
function ClusteredPins({
  pins,
  onPinPress,
  onViewportChange,
}: Pick<SinalizaMapProps, 'onPinPress' | 'onViewportChange'> & { pins: SinalizaMapProps['pins'] }) {
  const map = useMap();
  const [viewport, setViewport] = useState(() => viewportOf(map));
  useMapEvents({
    moveend: () => {
      const next = viewportOf(map);
      setViewport(next);
      onViewportChange?.(next);
    },
  });
  const index = useMemo(() => buildPinIndex(pins ?? NO_PINS), [pins]);
  const items: MapItem[] = useMemo(() => clusterItems(index, viewport), [index, viewport]);
  return items.map((item) =>
    item.kind === 'cluster' ? (
      <Marker
        key={`c${item.id}-${item.count}`}
        position={[item.lat, item.lng]}
        icon={clusterIcon(item.count)}
        title={t.mapa.grupo(item.count)}
        alt={t.mapa.grupo(item.count)}
        keyboard
        eventHandlers={{ click: () => map.setView([item.lat, item.lng], item.zoom) }}
      />
    ) : (
      <Marker
        key={item.pin.id}
        position={[item.pin.lat, item.pin.lng]}
        icon={dotIcon(statusColors[item.pin.status], 22)}
        title={item.pin.label}
        alt={item.pin.label}
        keyboard
        eventHandlers={onPinPress ? { click: () => onPinPress(item.pin.id) } : {}}
      />
    ),
  );
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
  pins = NO_PINS,
  onPinPress,
  onViewportChange,
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
        <ClusteredPins pins={pins} onPinPress={onPinPress} onViewportChange={onViewportChange} />
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
