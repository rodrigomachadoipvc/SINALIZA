import {
  bboxParam,
  buildPinIndex,
  clusterItems,
  type MapViewport,
  viewportFromRegion,
  zoomForDelta,
} from '../map/cluster';
import { deltaForZoom, type MapPinView } from '../map/types';

const pin = (id: string, lat: number, lng: number): MapPinView => ({
  id,
  lat,
  lng,
  status: 'RECEBIDA',
  label: id,
});

describe('viewport', () => {
  it('inverts deltaForZoom', () => {
    for (const zoom of [10, 13, 17]) expect(zoomForDelta(deltaForZoom(zoom))).toBeCloseTo(zoom);
  });

  it('turns a react-native-maps region into a bbox and zoom', () => {
    const v = viewportFromRegion({
      latitude: 41.5,
      longitude: -8.6,
      latitudeDelta: 0.2,
      longitudeDelta: 0.4,
    });
    expect(v.bbox[0]).toBeCloseTo(-8.8);
    expect(v.bbox[1]).toBeCloseTo(41.4);
    expect(v.bbox[2]).toBeCloseTo(-8.4);
    expect(v.bbox[3]).toBeCloseTo(41.6);
    expect(v.zoom).toBeCloseTo(Math.log2(900));
  });
});

describe('bboxParam', () => {
  it('pads by half a screen and snaps outwards to the 0.02° grid', () => {
    expect(bboxParam([-8.65, 41.5, -8.61, 41.54])).toBe('-8.68,41.48,-8.58,41.56');
  });

  it('keeps the same value for a small pan, so the cached response is reused', () => {
    expect(bboxParam([-8.651, 41.501, -8.611, 41.541])).toBe(
      bboxParam([-8.652, 41.502, -8.612, 41.542]),
    );
  });

  it('stays inside valid coordinates', () => {
    expect(bboxParam([-179, -89, 179, 89])).toBe('-180.00,-90.00,180.00,90.00');
  });
});

describe('clustering', () => {
  // Three pins a few metres apart and one about 4 km away.
  const pins = [
    pin('a', 41.5317, -8.6194),
    pin('b', 41.5318, -8.6195),
    pin('c', 41.5316, -8.6193),
    pin('far', 41.56, -8.6),
  ];
  const index = buildPinIndex(pins);
  const view = (zoom: number): MapViewport => ({ bbox: [-8.8, 41.4, -8.4, 41.7], zoom });

  it('merges nearby pins into one bubble when zoomed out', () => {
    const items = clusterItems(index, view(12));
    const cluster = items.find((i) => i.kind === 'cluster');
    expect(cluster).toMatchObject({ kind: 'cluster', count: 3 });
    expect(items).toContainEqual({ kind: 'pin', pin: pins[3] });
    expect(items).toHaveLength(2);
  });

  it('gives each bubble a zoom at which it splits', () => {
    const cluster = clusterItems(index, view(12)).find((i) => i.kind === 'cluster');
    if (cluster?.kind !== 'cluster') throw new Error('expected a cluster');
    expect(cluster.zoom).toBeGreaterThan(12);
    expect(cluster.zoom).toBeLessThanOrEqual(18);
  });

  it('shows every pin past the maximum cluster zoom', () => {
    const items = clusterItems(index, view(18));
    expect(items.every((i) => i.kind === 'pin')).toBe(true);
    expect(items).toHaveLength(4);
  });

  it('only returns what is inside the viewport', () => {
    const items = clusterItems(index, { bbox: [-8.61, 41.55, -8.59, 41.57], zoom: 18 });
    expect(items).toEqual([{ kind: 'pin', pin: pins[3] }]);
  });
});
