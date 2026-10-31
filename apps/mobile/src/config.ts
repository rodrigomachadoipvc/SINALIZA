/**
 * Gateway address. Expo inlines EXPO_PUBLIC_* at bundle time (apps/mobile/.env). On a phone with
 * Expo Go it must be the computer's LAN IP, because «localhost» would be the phone itself.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api').replace(
  /\/+$/,
  '',
);

/** Map start position: Barcelos town centre (spec A05). */
export const BARCELOS = { lat: 41.5317, lng: -8.6194, zoom: 13 } as const;

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
