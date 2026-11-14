export type TrailOverlayId = 'hiking' | 'ski';

/** A Swisstopo WMTS trail network drawn over the base map. */
export interface TrailOverlay {
  id: TrailOverlayId;
  /** GeoAdmin layer id, used for WMTS tiles and the identify API. */
  layerBodId: string;
  /** Highest WMTS zoom level; MapLibre overzooms beyond it. */
  maxzoom: number;
  labelKey: string;
  thumbnail: string;
  /** BaseIcon name on the panel tile, so the overlay reads without decoding map colors. */
  icon: string;
  /** Chip background behind the icon, in the overlay's map color (default: the panel blue). */
  iconColor?: string;
  /** Whether a map tap looks up features of this overlay. */
  identifiable: boolean;
}

/** Array order is draw order (later = on top). */
export const TRAIL_OVERLAYS: TrailOverlay[] = [
  {
    id: 'hiking',
    layerBodId: 'ch.swisstopo.swisstlm3d-wanderwege',
    maxzoom: 18,
    labelKey: 'map.layers.overlays.hiking',
    thumbnail: '/map-layers/hiking.png',
    icon: 'hiking',
    iconColor: 'var(--red-600)',
    identifiable: false,
  },
  {
    id: 'ski',
    layerBodId: 'ch.swisstopo-karto.skitouren',
    maxzoom: 17,
    labelKey: 'map.layers.overlays.ski',
    thumbnail: '/map-layers/ski.png',
    icon: 'downhill_skiing',
    identifiable: true,
  },
];

export function wmtsTileUrl(layerBodId: string): string {
  return `https://wmts.geo.admin.ch/1.0.0/${layerBodId}/default/current/3857/{z}/{x}/{y}.png`;
}

/**
 * Self-hosted ski-route dataset (TileJSON): vector tiles to mark and hit-test routes, plus one
 * full-geometry file per route. Published by `.github/workflows/ski-route-data.yml`; see
 * docs/ski-route-hosting.md.
 */
export const SKI_ROUTES_TILEJSON = 'https://tourenbuddy-data.pages.dev/ski-routes.json';
