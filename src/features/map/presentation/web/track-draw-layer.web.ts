// Ported from the PWA's features/map/presentation/components/track-draw-layer.ts (port-pwa-web): MapLibre GL JS on the web.
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { ARROW_LAYER_ID } from './gpx-track-layer.web';

/**
 * The drawing pen (MapLibre paint needs a literal): dark slate, no activity's colour and none of
 * swisstopo's blue routes, so a route being planned never reads as a hike (the PWA drew swisstopo's
 * red; owner, 2026-11-24). The saved tour wears its activities' colours.
 */
export const TRACK_PEN = '#1F2937';

/**
 * A drawn track on the map, the way the swisstopo app draws one: a line on a white casing,
 * end dots ringed in white, white dots ringed in the pen for the points between, a small handle
 * halfway along each leg to pull a new point out of it, and a faint dot where a tap waits for its
 * leg. `withPoints: false` draws the line alone (an unsaved track
 * behind the form). The line runs with the tracks, under the markers and their labels; the dots
 * sit on top, so every point stays in reach of a finger.
 */
export function createTrackDrawLayer(map: MapLibreMap, id: string, { withPoints = true } = {}) {
  const lineId = `${id}-line`;
  const casingId = `${id}-casing`;
  const pointsId = `${id}-points`;

  function setup() {
    if (map.getSource(id)) return;
    map.addSource(id, { type: 'geojson', data: empty() });
    const layout = { 'line-join': 'round', 'line-cap': 'round' } as const;
    const below = map.getLayer(ARROW_LAYER_ID) ? ARROW_LAYER_ID : undefined;
    const dim: ExpressionSpecification = ['boolean', ['get', 'dim'], false];
    map.addLayer(
      {
        id: casingId,
        type: 'line',
        source: id,
        filter: ['==', '$type', 'LineString'],
        layout,
        paint: {
          'line-color': '#ffffff',
          'line-width': ['case', dim, 7, 9],
          'line-opacity': ['case', dim, 0.6, 0.9],
        },
      },
      below,
    );
    map.addLayer(
      {
        id: lineId,
        type: 'line',
        source: id,
        filter: ['==', '$type', 'LineString'],
        layout,
        paint: {
          'line-color': TRACK_PEN,
          'line-width': ['case', dim, 3.5, 5],
          'line-opacity': ['case', dim, 0.45, 1],
        },
      },
      below,
    );
    if (!withPoints) return;
    map.addLayer({
      id: pointsId,
      type: 'circle',
      source: id,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': ['match', ['get', 'role'], 'end', 8, 'mid', 4, 5],
        'circle-color': ['match', ['get', 'role'], 'end', TRACK_PEN, '#ffffff'],
        'circle-stroke-color': ['match', ['get', 'role'], 'end', '#ffffff', TRACK_PEN],
        'circle-stroke-width': ['match', ['get', 'role'], 'mid', 2, 3],
        'circle-opacity': ['match', ['get', 'role'], 'queued', 0.6, 'mid', 0.9, 1],
        'circle-stroke-opacity': ['match', ['get', 'role'], 'queued', 0.6, 'mid', 0.75, 1],
      },
    });
  }

  /** `dimmed`: lines drawn fainter, under the rest (a trip's other days beside the one at hand). */
  function update(
    { points, legs, goal }: DrawnTrack,
    queued: readonly LngLat[] = [],
    handles: readonly (LngLat | null)[] = [],
    dimmed: readonly LngLat[][] = [],
  ) {
    const point = (coordinates: LngLat, role: string): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { role },
      geometry: { type: 'Point', coordinates },
    });
    const line = (coordinates: LngLat[], dim: boolean): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { dim },
      geometry: { type: 'LineString', coordinates },
    });
    const features: GeoJSON.Feature[] = [
      ...dimmed.map((leg) => line([...leg], true)),
      ...legs.map((leg) => line(leg, false)),
    ];
    if (withPoints) {
      // A route's start, goal and end carry the tour's own markers (the page draws them): only the points between get a dot.
      const vias = points.filter((_, i) => i > 0 && i < points.length - 1 && i !== goal);
      const ends = goal == null ? [points[0], points.length > 1 ? points.at(-1) : undefined] : [];
      // Ends last, so they sit on top of a loop's closing point.
      features.push(
        ...handles.filter((p) => !!p).map((p) => point(p, 'mid')),
        ...vias.map((p) => point(p, 'via')),
        ...queued.map((p) => point(p, 'queued')),
        ...ends.filter((p) => !!p).map((p) => point(p, 'end')),
      );
    }
    map.getSource<GeoJSONSource>(id)?.setData({ type: 'FeatureCollection', features });
  }

  function remove() {
    for (const layer of [pointsId, lineId, casingId]) {
      if (map.getLayer(layer)) map.removeLayer(layer);
    }
    if (map.getSource(id)) map.removeSource(id);
  }

  return { setup, update, remove };
}

function empty(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}
