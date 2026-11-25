// Ported from the PWA's features/map/presentation/components/trail-layers.ts (port-pwa-web): MapLibre GL JS on the web.
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { TrailOverlayId } from '@/features/map/data/trail-overlays';
import type { Trail } from '@/features/map/domain/entities/trail';
import {
  SKI_ROUTES_TILEJSON,
  TRAIL_OVERLAYS,
  wmtsTileUrl,
} from '@/features/map/data/trail-overlays';
import { gradeColorExpression, registerSkiBadges, skiBadgeImage } from './ski-badge.web';
import { TRACK_PEN } from './track-draw-layer.web';

/**
 * Ski routes are marked (halo + badges) and tappable from this zoom. Below it the
 * WMTS raster still draws every route; the self-hosted tiles start here (z11–z13).
 */
export const TRAIL_LOOKUP_MIN_ZOOM = 11;
/** Vector source of the self-hosted ski-route tiles; source-layer `routes`. */
export const SKI_ROUTES_SOURCE_ID = 'trail-clickable';
export const SKI_ROUTES_SOURCE_LAYER = 'routes';
/** The halo is the tap target: every marked route has one along its whole line. */
export const CLICKABLE_HALO_LAYER_ID = 'trail-clickable-halo';
const CLICKABLE_MARKER_LAYER_ID = 'trail-clickable-marker';
const HIGHLIGHT_SOURCE_ID = 'trail-highlight';
const FAINT_LAYER_ID = 'trail-highlight-faint';
const CASING_LAYER_ID = 'trail-highlight-casing';
const SELECTED_LAYER_ID = 'trail-highlight-selected';
// The drawing pen (owner, 2026-11-24): no activity's colour (the PWA's orange read as the glider's)
// and not blue, which would vanish into swisstopo's blue ski routes.
const HIGHLIGHT_COLOR = TRACK_PEN;
/** Trail overlays behind a drawing. */
const DIMMED_OPACITY = 0.4;

const layerId = (id: TrailOverlayId) => `trail-overlay-${id}`;
// Swisstopo's exact string (base map + Classic use it too): MapLibre merges identical
// attributions only, so any variant shows up as a second credit.
const SWISSTOPO_ATTRIBUTION = '© swisstopo';

interface CardState {
  candidates: Trail[];
  selectedId: string | null;
}

export interface TrailLayerState {
  active: TrailOverlayId[];
  /** UI language (de/fr/it/en): which difficulty notation the badges show. */
  lang: string;
  card: CardState | null;
}

/**
 * Trail overlays, the clickable-route affordance and the lookup highlight, as one
 * fixed stack. `setup()` must run on every style load BEFORE markers and GPX:
 * MapLibre appends in call order, so everything added later sits above. Overlays
 * are toggled by visibility, never added/removed, so the order holds by construction.
 *
 * Stack: hiking raster → clickable halo → ski raster → highlight → difficulty badges.
 * The halo sits under the ski raster, so a clickable route reads as the same blue
 * line with a soft glow around it.
 */
export function createTrailLayers(map: MapLibreMap) {
  registerSkiBadges(map);

  function addOverlay(id: TrailOverlayId, active: TrailOverlayId[]) {
    const overlay = TRAIL_OVERLAYS.find((o) => o.id === id)!;
    map.addSource(layerId(id), {
      type: 'raster',
      tiles: [wmtsTileUrl(overlay.layerBodId)],
      tileSize: 256,
      maxzoom: overlay.maxzoom,
      attribution: SWISSTOPO_ATTRIBUTION,
    });
    map.addLayer({
      id: layerId(id),
      type: 'raster',
      source: layerId(id),
      layout: { visibility: active.includes(id) ? 'visible' : 'none' },
    });
  }

  function setup({ active, lang, card }: TrailLayerState) {
    const line = { 'line-join': 'round', 'line-cap': 'round' } as const;
    const ski = active.includes('ski') ? 'visible' : 'none';

    addOverlay('hiking', active);
    // Only routes with route info are in these tiles, so everything here is marked.
    // Source options override the TileJSON's attribution (MapLibre `loadTileJson`).
    map.addSource(SKI_ROUTES_SOURCE_ID, {
      type: 'vector',
      url: SKI_ROUTES_TILEJSON,
      attribution: SWISSTOPO_ATTRIBUTION,
    });
    map.addLayer({
      id: CLICKABLE_HALO_LAYER_ID,
      type: 'line',
      source: SKI_ROUTES_SOURCE_ID,
      'source-layer': SKI_ROUTES_SOURCE_LAYER,
      minzoom: TRAIL_LOOKUP_MIN_ZOOM,
      layout: { ...line, visibility: ski },
      paint: {
        'line-color': gradeColorExpression(),
        'line-width': 10,
        'line-opacity': 0.5,
        'line-blur': 2,
      },
    });
    addOverlay('ski', active);

    map.addSource(HIGHLIGHT_SOURCE_ID, { type: 'geojson', data: highlightGeoJson(card) });
    map.addLayer({
      id: FAINT_LAYER_ID,
      type: 'line',
      source: HIGHLIGHT_SOURCE_ID,
      filter: ['!', ['get', 'selected']],
      layout: line,
      paint: { 'line-color': HIGHLIGHT_COLOR, 'line-width': 4, 'line-opacity': 0.45 },
    });
    map.addLayer({
      id: CASING_LAYER_ID,
      type: 'line',
      source: HIGHLIGHT_SOURCE_ID,
      filter: ['get', 'selected'],
      layout: line,
      paint: { 'line-color': '#ffffff', 'line-width': 8 },
    });
    map.addLayer({
      id: SELECTED_LAYER_ID,
      type: 'line',
      source: HIGHLIGHT_SOURCE_ID,
      filter: ['get', 'selected'],
      layout: line,
      paint: { 'line-color': HIGHLIGHT_COLOR, 'line-width': 4 },
    });
    map.addLayer({
      id: CLICKABLE_MARKER_LAYER_ID,
      type: 'symbol',
      source: SKI_ROUTES_SOURCE_ID,
      'source-layer': SKI_ROUTES_SOURCE_LAYER,
      minzoom: TRAIL_LOOKUP_MIN_ZOOM,
      layout: {
        visibility: ski,
        'icon-image': skiBadgeImage(lang),
        // Badges repeat along each route and collide like labels: routes sharing an
        // approach (several tours from one hut) show one badge there, not a stack,
        // and each route still gets badges on its own stretch. The halo marks the
        // whole line, so a dropped badge never hides a tappable route.
        'symbol-placement': 'line',
        'symbol-spacing': 220,
        'icon-rotation-alignment': 'viewport',
        'icon-padding': 4,
      },
    });
  }

  function setVisible(active: TrailOverlayId[]) {
    for (const overlay of TRAIL_OVERLAYS) {
      if (map.getLayer(layerId(overlay.id)))
        map.setLayoutProperty(
          layerId(overlay.id),
          'visibility',
          active.includes(overlay.id) ? 'visible' : 'none',
        );
    }
    for (const id of [CLICKABLE_HALO_LAYER_ID, CLICKABLE_MARKER_LAYER_ID]) {
      if (map.getLayer(id))
        map.setLayoutProperty(id, 'visibility', active.includes('ski') ? 'visible' : 'none');
    }
  }

  /**
   * While a track is drawn the trails step back: still there to aim at, but the drawn red line
   * must not drown in the red hiking trails.
   */
  function setDimmed(dimmed: boolean) {
    for (const overlay of TRAIL_OVERLAYS) {
      if (map.getLayer(layerId(overlay.id)))
        map.setPaintProperty(layerId(overlay.id), 'raster-opacity', dimmed ? DIMMED_OPACITY : 1);
    }
    if (map.getLayer(CLICKABLE_HALO_LAYER_ID))
      map.setPaintProperty(CLICKABLE_HALO_LAYER_ID, 'line-opacity', dimmed ? 0.2 : 0.5);
  }

  function setLang(lang: string) {
    if (map.getLayer(CLICKABLE_MARKER_LAYER_ID))
      map.setLayoutProperty(CLICKABLE_MARKER_LAYER_ID, 'icon-image', skiBadgeImage(lang));
  }

  function setHighlight(card: CardState | null) {
    map.getSource<GeoJSONSource>(HIGHLIGHT_SOURCE_ID)?.setData(highlightGeoJson(card));
  }

  return { setup, setVisible, setDimmed, setLang, setHighlight };
}

/** List view: every candidate faint. Detail view: only the chosen route, fully highlighted. */
function highlightGeoJson(card: CardState | null): GeoJSON.FeatureCollection {
  const shown = card?.selectedId
    ? card.candidates.filter((c) => c.id === card.selectedId)
    : (card?.candidates ?? []);
  return {
    type: 'FeatureCollection',
    features: shown.map((trail) => ({
      type: 'Feature',
      properties: { selected: trail.id === card?.selectedId },
      geometry: { type: 'MultiLineString', coordinates: trail.lines },
    })),
  };
}
