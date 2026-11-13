import type { ExpressionSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';

import { TRAIL_OVERLAYS, type TrailOverlayId } from '@/features/map/data/trail-overlays';

import {
  BUCKET_COLORS,
  CLUSTER_FACE,
  CLUSTER_SHADOW,
  COMPLETED_BADGE,
  END_ICON,
  FRIEND_BADGE,
  GRADE_COLOR_EXPRESSION,
  LINK_BADGE,
  MARKER_RADIUS,
  PIE_STEPS,
  SKI_BADGE_PREFIX,
  START_ICON,
  WEDGE_PREFIX,
} from './marker-ids';

/**
 * The map's own layers, one stack for MapLibre Native and GL JS, bottom to top: hiking raster, ski
 * route halo, ski raster, ski badges, lines (tracks, legs), tours (clusters with colour pies,
 * circles or pies, activity glyphs, badges, labels), points (start, end, previews). Overlays switch
 * `visibility` and are never removed, so the order never changes (map-trail-overlays "Overlay draw
 * order").
 */
export const CLUSTER_LAYER = 'tour-clusters';
export const TOUR_LAYERS = ['tour-circles', 'tour-pies'];
export const SKI_HALO_LAYER = 'ski-halo';

export const overlaySourceId = (id: TrailOverlayId) => `overlay-${id}`;
export const SKI_SOURCE = 'ski-routes';

const LINE = { 'line-join': 'round', 'line-cap': 'round' } as const;
const OVERLAP = { 'icon-allow-overlap': true, 'icon-ignore-placement': true } as const;
const IS_CLUSTER: ExpressionSpecification = ['has', 'point_count'];
const NOT_CLUSTER: ExpressionSpecification = ['!', IS_CLUSTER];
const LABEL_FONT = ['Frutiger Neue Medium'];
const LABEL_MIN_ZOOM = 10;

/** The tours source's clustering. */
export const TOURS_CLUSTER = {
  cluster: true,
  clusterRadius: 50,
  clusterMaxZoom: 16,
  // The full reduce form: iOS turns each array element into an NSExpression, so GL JS's
  // shorthand `['+', ['get', 'w0']]` arrives as the string "+" and sums nothing (S3).
  clusterProperties: Object.fromEntries(
    BUCKET_COLORS.map((_, i) => [
      `w${i}`,
      [
        ['+', ['accumulated'], ['get', `w${i}`]],
        ['get', `w${i}`],
      ],
    ]),
  ),
};

/** Whole steps (of 24) of a cluster's tours in the buckets before `i`; wedges telescope to 24. */
function before(i: number): ExpressionSpecification | number {
  if (i === 0) return 0;
  const sum = BUCKET_COLORS.slice(0, i).map((_, j): ExpressionSpecification => ['get', `w${j}`]);
  return [
    'round',
    ['*', PIE_STEPS, ['/', sum.length > 1 ? ['+', ...sum] : sum[0], ['get', 'point_count']]],
  ] as ExpressionSpecification;
}

export type TourMapLayers = {
  /** One per trail overlay, in `TRAIL_OVERLAYS` order, each on its own raster source. */
  overlays: LayerSpecification[];
  ski: LayerSpecification[];
  lines: LayerSpecification[];
  tours: LayerSpecification[];
  points: LayerSpecification[];
};

export function tourMapLayers({
  overlays,
  dimTrails,
}: {
  overlays: readonly TrailOverlayId[];
  dimTrails: boolean;
}): TourMapLayers {
  const visible = (id: TrailOverlayId) => (overlays.includes(id) ? 'visible' : 'none');
  const ski = visible('ski');

  return {
    overlays: TRAIL_OVERLAYS.map((overlay) => ({
      id: overlaySourceId(overlay.id),
      source: overlaySourceId(overlay.id),
      type: 'raster',
      layout: { visibility: visible(overlay.id) },
      paint: { 'raster-opacity': dimTrails ? 0.4 : 1 },
    })),
    ski: [
      {
        id: SKI_HALO_LAYER,
        source: SKI_SOURCE,
        type: 'line',
        'source-layer': 'routes',
        minzoom: 11,
        layout: { ...LINE, visibility: ski },
        paint: {
          'line-color': GRADE_COLOR_EXPRESSION,
          'line-width': 10,
          'line-opacity': dimTrails ? 0.2 : 0.5,
          'line-blur': 2,
        },
      },
      {
        id: 'ski-badges',
        source: SKI_SOURCE,
        type: 'symbol',
        'source-layer': 'routes',
        minzoom: 11,
        layout: {
          visibility: ski,
          'icon-image': ['concat', SKI_BADGE_PREFIX, ['coalesce', ['get', 'difficulty_de'], '']],
          'symbol-placement': 'line',
          'symbol-spacing': 220,
          'icon-rotation-alignment': 'viewport',
          'icon-padding': 4,
        },
      },
    ],
    lines: [
      {
        id: 'line-casing',
        source: 'lines',
        type: 'line',
        filter: ['==', ['get', 'casing'], true],
        layout: LINE,
        paint: {
          'line-color': '#ffffff',
          'line-width': ['+', ['coalesce', ['get', 'width'], 4], 3],
        },
      },
      {
        id: 'line',
        source: 'lines',
        type: 'line',
        filter: ['!=', ['get', 'dashed'], true],
        layout: LINE,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['coalesce', ['get', 'width'], 4],
          'line-opacity': ['coalesce', ['get', 'opacity'], 1],
        },
      },
      {
        id: 'line-dashed',
        source: 'lines',
        type: 'line',
        filter: ['==', ['get', 'dashed'], true],
        layout: LINE,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['coalesce', ['get', 'width'], 3],
          'line-dasharray': [1.5, 1.5],
        },
      },
    ],
    tours: [
      {
        id: 'tour-circles',
        source: 'tours',
        type: 'circle',
        filter: NOT_CLUSTER,
        paint: {
          'circle-radius': ['case', ['get', 'selected'], MARKER_RADIUS + 4, MARKER_RADIUS],
          'circle-color': [
            'case',
            ['to-boolean', ['get', 'pie']],
            'rgba(0,0,0,0)',
            ['get', 'color'],
          ],
          'circle-opacity': ['case', ['get', 'completed'], 0.75, 0.95],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 1.5],
          'circle-stroke-color': '#ffffff',
        },
      },
      {
        id: 'tour-pies',
        source: 'tours',
        type: 'symbol',
        filter: ['all', NOT_CLUSTER, ['to-boolean', ['get', 'pie']]],
        layout: { 'icon-image': ['get', 'pie'], ...OVERLAP },
      },
      {
        id: 'tour-activity',
        source: 'tours',
        type: 'symbol',
        filter: NOT_CLUSTER,
        layout: { 'icon-image': ['get', 'activity'], ...OVERLAP },
      },
      {
        id: 'tour-completed',
        source: 'tours',
        type: 'symbol',
        filter: ['all', NOT_CLUSTER, ['get', 'completed']],
        layout: { 'icon-image': COMPLETED_BADGE, 'icon-offset': [10, -10], ...OVERLAP },
      },
      {
        id: 'tour-friend',
        source: 'tours',
        type: 'symbol',
        filter: ['all', NOT_CLUSTER, ['get', 'friend']],
        layout: { 'icon-image': FRIEND_BADGE, 'icon-offset': [-10, -10], ...OVERLAP },
      },
      {
        id: 'tour-linked',
        source: 'tours',
        type: 'symbol',
        filter: ['all', NOT_CLUSTER, ['get', 'linked']],
        layout: { 'icon-image': LINK_BADGE, 'icon-offset': [10, 10], ...OVERLAP },
      },
      {
        id: 'tour-labels',
        source: 'tours',
        type: 'symbol',
        filter: NOT_CLUSTER,
        minzoom: LABEL_MIN_ZOOM,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': LABEL_FONT,
          'text-size': 13,
          'text-offset': [0, 1.6],
          'text-anchor': 'top',
          'text-max-width': 10,
          'text-optional': true,
        },
        paint: { 'text-color': '#1c1917', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
      {
        id: 'tour-cluster-shadow',
        source: 'tours',
        type: 'symbol',
        filter: IS_CLUSTER,
        layout: { 'icon-image': CLUSTER_SHADOW, ...OVERLAP },
      },
      ...BUCKET_COLORS.map((_, i): LayerSpecification => {
        const steps = ['-', before(i + 1), before(i)] as ExpressionSpecification;
        return {
          id: `tour-cluster-wedge-${i}`,
          source: 'tours',
          type: 'symbol',
          filter: ['all', IS_CLUSTER, ['>', steps, 0]],
          layout: {
            'icon-image': ['concat', `${WEDGE_PREFIX}${i}|`, ['to-string', steps]],
            'icon-rotate': ['*', 360 / PIE_STEPS, before(i)],
            'icon-rotation-alignment': 'viewport',
            ...OVERLAP,
          },
        };
      }),
      {
        id: CLUSTER_LAYER,
        source: 'tours',
        type: 'symbol',
        filter: IS_CLUSTER,
        layout: {
          'icon-image': CLUSTER_FACE,
          ...OVERLAP,
          'text-field': ['to-string', ['get', 'point_count']],
          'text-font': LABEL_FONT,
          'text-size': ['step', ['get', 'point_count'], 12, 100, 10],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#1c1917' },
      },
    ],
    points: [
      {
        id: 'point-preview',
        source: 'points',
        type: 'circle',
        filter: ['==', ['get', 'kind'], 'preview'],
        paint: {
          'circle-radius': MARKER_RADIUS + 2,
          'circle-color': ['coalesce', ['get', 'color'], '#2563eb'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      },
      {
        id: 'point-icons',
        source: 'points',
        type: 'symbol',
        filter: ['!=', ['get', 'kind'], 'preview'],
        layout: {
          'icon-image': ['match', ['get', 'kind'], 'end', END_ICON, START_ICON],
          ...OVERLAP,
        },
      },
      {
        id: 'point-labels',
        source: 'points',
        type: 'symbol',
        filter: ['has', 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONT,
          'text-size': 11,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': '#334155', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
    ],
  };
}
