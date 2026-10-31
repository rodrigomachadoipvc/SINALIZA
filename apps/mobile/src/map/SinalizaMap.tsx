import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon, UrlTile } from 'react-native-maps';

import { AppText } from '../components/AppText';
import { OSM_TILES } from '../config';
import { t } from '../i18n/pt-PT';
import { colors, statusColors } from '../theme/tokens';
import { buildPinIndex, clusterItems, viewportFromRegion } from './cluster';
import { boundaryRings, deltaForZoom, NO_PINS, type SinalizaMapProps } from './types';

/**
 * OpenStreetMap tiles over react-native-maps (works in Expo Go). On Android the Google base map is
 * switched off (`mapType="none"`) so only the OSM tiles show. Pins are clustered for the visible
 * area, so only a few dozen native markers exist however many occurrences are loaded.
 */
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
  const mapRef = useRef<MapView>(null);
  const delta = deltaForZoom(zoom);
  const initialRegion = {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
  const [viewport, setViewport] = useState(() => viewportFromRegion(initialRegion));
  const index = useMemo(() => buildPinIndex(pins), [pins]);
  const items = useMemo(() => clusterItems(index, viewport), [index, viewport]);

  return (
    <View style={[styles.wrap, style]} accessibilityLabel={accessibilityLabel}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType="none"
        initialRegion={initialRegion}
        onRegionChangeComplete={(region) => {
          const next = viewportFromRegion(region);
          setViewport(next);
          onViewportChange?.(next);
        }}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        onPress={
          onMarkerChange
            ? (e) =>
                onMarkerChange({
                  lat: e.nativeEvent.coordinate.latitude,
                  lng: e.nativeEvent.coordinate.longitude,
                })
            : undefined
        }
      >
        <UrlTile urlTemplate={OSM_TILES} maximumZ={19} shouldReplaceMapContent tileSize={256} />
        {boundary
          ? boundaryRings(boundary).map((ring, i) => (
              <Polygon
                key={i}
                coordinates={ring.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor={colors.azul}
                strokeWidth={2}
                lineDashPattern={[6, 4]}
                fillColor="rgba(26, 43, 76, 0.04)"
                tappable={false}
              />
            ))
          : null}
        {items.map((item) => {
          if (item.kind === 'cluster') {
            const span = deltaForZoom(item.zoom);
            return (
              <Marker
                // The count is in the key so a bubble whose count changes is redrawn.
                key={`c${item.id}-${item.count}`}
                coordinate={{ latitude: item.lat, longitude: item.lng }}
                onPress={() =>
                  mapRef.current?.animateToRegion(
                    {
                      latitude: item.lat,
                      longitude: item.lng,
                      latitudeDelta: span,
                      longitudeDelta: span,
                    },
                    300,
                  )
                }
                tracksViewChanges={false}
                accessibilityLabel={t.mapa.grupo(item.count)}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.cluster, clusterSize(item.count)]}>
                  <AppText variant="legendaForte" style={{ color: colors.branco }}>
                    {item.count}
                  </AppText>
                </View>
              </Marker>
            );
          }
          const p = item.pin;
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              onPress={onPinPress ? () => onPinPress(p.id) : undefined}
              tracksViewChanges={false}
              accessibilityLabel={p.label}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[styles.pin, { backgroundColor: statusColors[p.status] }]} />
            </Marker>
          );
        })}
        {marker ? (
          <Marker
            coordinate={{ latitude: marker.lat, longitude: marker.lng }}
            draggable={Boolean(onMarkerChange)}
            pinColor={colors.amarelo}
            onDragEnd={(e) =>
              onMarkerChange?.({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              })
            }
          />
        ) : null}
      </MapView>
      <View style={styles.attribution} pointerEvents="none">
        <AppText variant="legenda" style={{ color: colors.azul }}>
          {t.mapa.atribuicao}
        </AppText>
      </View>
    </View>
  );
}

/** Bubbles grow a little with the count: 36, 44 or 52 px. */
function clusterSize(count: number) {
  const size = count < 10 ? 36 : count < 100 ? 44 : 52;
  return { width: size, height: size, borderRadius: size / 2 };
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: colors.cinzaClaro },
  pin: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: colors.branco },
  cluster: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.azul,
    borderWidth: 3,
    borderColor: colors.branco,
  },
  attribution: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
});
