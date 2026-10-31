import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polygon, UrlTile } from 'react-native-maps';

import { AppText } from '../components/AppText';
import { OSM_TILES } from '../config';
import { t } from '../i18n/pt-PT';
import { colors, statusColors } from '../theme/tokens';
import { boundaryRings, deltaForZoom, type SinalizaMapProps } from './types';

/**
 * OpenStreetMap tiles over react-native-maps (works in Expo Go). On Android the Google base map is
 * switched off (`mapType="none"`) so only the OSM tiles show.
 */
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
  const delta = deltaForZoom(zoom);
  return (
    <View style={[styles.wrap, style]} accessibilityLabel={accessibilityLabel}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapType="none"
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: delta,
          longitudeDelta: delta,
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
        {pins.map((p) => (
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
        ))}
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

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: colors.cinzaClaro },
  pin: { width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: colors.branco },
  attribution: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
});
