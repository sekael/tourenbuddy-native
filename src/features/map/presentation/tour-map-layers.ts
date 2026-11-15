import type { ExpressionSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';

import { color, space } from '@/core/theme/tokens';
import { TRAIL_OVERLAYS, type TrailOverlayId } from '@/features/map/data/trail-overlays';

import {
  BLANK_IMAGE,
  BUCKET_COLORS,
  CHAIN_DOT,
  CLUSTER_FACE,
  CLUSTER_SHADOW,
  COMPLETED_BADGE,
  DONE_MAX,
  DONE_PREFIX,
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
 * route halo, ski raster, ski badges, lines (tracks, legs, outing chains, gaps, arrows), tours
 * (clusters with colour pies and done counts, circles or pies, activity glyphs, badges, labels),
 * points (start, end, hand-overs, previews, the "+N" of a spot), then the focus: the open tour or
 * the open outing's stages, never clustered, numbered, named at every zoom (D15, D16). Overlays
 * switch `visibility` and are never removed, so the order never changes (map-trail-overlays
 * "Overlay draw order").
 */
export const CLUSTER_LAYER = 'tour-clusters';
export const TOUR_LAYERS = ['tour-circles', 'tour-pies', 'focus-circles', 'focus-pies'];
/** The "+N" chip beside an open tour (its spot's other tours). */
export const MORE_LAYER = 'point-more';
export const SKI_HALO_LAYER = 'ski-halo';

export const overlaySourceId = (id: TrailOverlayId) => `overlay-${id}`;
export const SKI_SOURCE = 'ski-routes';

const LINE = { 'line-join': 'round', 'line-cap': 'round' } as const;
const OVERLAP = { 'icon-allow-overlap': true, 'icon-ignore-placement': true } as const;
const IS_CLUSTER: ExpressionSpecification = ['has', 'point_count'];
const NOT_CLUSTER: ExpressionSpecification = ['!', IS_CLUSTER];
const LABEL_FONT = ['Frutiger Neue Medium'];
const LABEL_SUB_FONT = ['Frutiger Neue Regular'];
const LABEL_MIN_ZOOM = 10;

/** A sum over the cluster's tours, in the full reduce form iOS needs (S3). */
const sum = (key: string) => [
  ['+', ['accumulated'], ['get', key]],
  ['get', key],
];

/** The tours source's clustering. */
export const TOURS_CLUSTER = {
  cluster: true,
  clusterRadius: 50,
  clusterMaxZoom: 16,
  // The full reduce form: iOS turns each array element into an NSExpression, so GL JS's
  // shorthand `['+', ['get', 'w0']]` arrives as the string "+" and sums nothing (S3).
  clusterProperties: {
    ...Object.fromEntries(BUCKET_COLORS.map((_, i) => [`w${i}`, sum(`w${i}`)])),
    doneW: sum('doneW'),
  },
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
  /** Areas outlined on the map: the saved offline regions. */
  areas: LayerSpecification[];
  lines: LayerSpecification[];
  tours: LayerSpecification[];
  points: LayerSpecification[];
  /** The open tour or outing's markers, on the unclustered `focus` source. */
  focus: LayerSpecification[];
  /**
   * On top of all, so placed first (MapLibre places the top layer's symbols first): the open
   * markers' footprints (`footprints`), the stages' names (`focus-names`, the focus's data), then
   * the start and end names (`labels`), each keeping clear of what was placed before it.
   */
  labels: LayerSpecification[];
  focusNames: LayerSpecification[];
  footprints: LayerSpecification[];
};

/**
 * A tour's marker on `source`: its circle or pie, activity glyph, corner badges, stage number and
 * name over the line under it. The `tours` source names from zoom 10 on, the focus always.
 */
function markerLayers(source: 'tours' | 'focus' | 'focus-names'): LayerSpecification[] {
  const id = (name: string) => `${source === 'tours' ? 'tour' : 'focus'}-${name}`;
  const only = (filter?: ExpressionSpecification): ExpressionSpecification | undefined =>
    source === 'tours' ? (filter ? ['all', NOT_CLUSTER, filter] : NOT_CLUSTER) : filter;
  const SELECTED: ExpressionSpecification = ['get', 'selected'];
  const layers: LayerSpecification[] = [
    {
      id: id('circles'),
      source,
      type: 'circle',
      ...(only() ? { filter: only() } : {}),
      paint: {
        'circle-radius': ['case', SELECTED, MARKER_RADIUS + 4, MARKER_RADIUS],
        'circle-color': ['case', ['to-boolean', ['get', 'pie']], 'rgba(0,0,0,0)', ['get', 'color']],
        'circle-opacity': ['case', ['get', 'completed'], 0.75, 0.95],
        // An open outing's stages wear a thicker ring, the open one its thickest (D16).
        'circle-stroke-width': ['case', SELECTED, 3, ['has', 'segment'], 2.5, 1.5],
        'circle-stroke-color': '#ffffff',
      },
    },
    {
      id: id('pies'),
      source,
      type: 'symbol',
      filter: only(['to-boolean', ['get', 'pie']]),
      layout: {
        'icon-image': ['get', 'pie'],
        'icon-size': ['case', SELECTED, (MARKER_RADIUS + 4) / MARKER_RADIUS, 1],
        ...OVERLAP,
      },
    },
    {
      id: id('activity'),
      source,
      type: 'symbol',
      ...(only() ? { filter: only() } : {}),
      layout: {
        'icon-image': ['get', 'activity'],
        'icon-size': ['case', SELECTED, 1.25, 1],
        ...OVERLAP,
      },
    },
    {
      id: id('completed'),
      source,
      type: 'symbol',
      filter: only(['get', 'completed']),
      layout: {
        // Corner badges on the circle's edge: done lower right, friend or link lower left (D5).
        'icon-image': COMPLETED_BADGE,
        'icon-offset': ['case', SELECTED, ['literal', [14, 14]], ['literal', [11, 11]]],
        ...OVERLAP,
      },
    },
    {
      id: id('friend'),
      source,
      type: 'symbol',
      // The link badge takes the friend badge's corner.
      filter: only(['all', ['get', 'friend'], ['!', ['get', 'linked']]]),
      layout: {
        'icon-image': FRIEND_BADGE,
        'icon-offset': ['case', SELECTED, ['literal', [-14, 14]], ['literal', [-11, 11]]],
        ...OVERLAP,
      },
    },
    {
      id: id('linked'),
      source,
      type: 'symbol',
      filter: only(['get', 'linked']),
      layout: {
        'icon-image': LINK_BADGE,
        'icon-offset': ['case', SELECTED, ['literal', [-14, 14]], ['literal', [-11, 11]]],
        ...OVERLAP,
      },
    },
    {
      id: id('segment'),
      source,
      type: 'symbol',
      filter: only(['has', 'segment']),
      layout: {
        'icon-image': ['get', 'segment'],
        'icon-offset': ['case', SELECTED, ['literal', [15, -15]], ['literal', [12, -12]]],
        ...OVERLAP,
      },
    },
    {
      id: id('labels'),
      source,
      type: 'symbol',
      ...(only() ? { filter: only() } : {}),
      ...(source === 'tours' ? { minzoom: LABEL_MIN_ZOOM } : {}),
      layout: {
        // The name, then stage · height · date (or done, or no date), smaller (D4).
        'text-field': [
          'case',
          ['==', ['get', 'sub'], ''],
          ['format', ['get', 'name'], { 'text-font': ['literal', LABEL_FONT] }],
          [
            'format',
            ['get', 'name'],
            { 'text-font': ['literal', LABEL_FONT] },
            '\n',
            {},
            ['get', 'sub'],
            { 'text-font': ['literal', LABEL_SUB_FONT], 'font-scale': 0.85 },
          ],
        ],
        'text-font': LABEL_FONT,
        'text-size': 13,
        'text-line-height': 1.15,
        // Below the marker, else above it, clear of the start, end and other markers (D22); never
        // beside it, where a long second line would run off the screen's edge.
        'text-variable-anchor': ['top', 'bottom'],
        'text-radial-offset': ['case', SELECTED, 1.75, 1.45],
        'text-justify': 'auto',
        'text-padding': 3,
        'text-max-width': 12,
        'text-optional': true,
      },
      paint: { 'text-color': '#1c1917', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
  ];
  // The focus draws its names from a source of their own, placed above the start and end names.
  if (source === 'focus') return layers.filter((layer) => layer.id !== 'focus-labels');
  if (source === 'focus-names') return layers.filter((layer) => layer.id === 'focus-labels');
  return layers;
}

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
    areas: [
      {
        id: 'area-fill',
        source: 'areas',
        type: 'fill',
        paint: { 'fill-color': color.areaFill },
      },
      {
        id: 'area-outline',
        source: 'areas',
        type: 'line',
        layout: LINE,
        paint: { 'line-color': color.primary, 'line-width': 2 },
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
        filter: ['all', ['!=', ['get', 'dashed'], true], ['!=', ['get', 'dotted'], true]],
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
      {
        // An outing's chain of goals (D8): round dots, not dashes, which are footpaths on the map.
        // Dots as symbols along the arc: MapLibre Native draws a zero-length dash as a solid line.
        id: 'line-dots',
        source: 'lines',
        type: 'symbol',
        filter: ['==', ['get', 'dotted'], true],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 9,
          'icon-image': CHAIN_DOT,
          'icon-rotation-alignment': 'map',
          ...OVERLAP,
        },
        paint: { 'icon-opacity': 0.75 },
      },
      {
        // A straight leg's direction, every so often along it.
        id: 'line-arrows',
        source: 'lines',
        type: 'symbol',
        filter: ['has', 'arrow'],
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 120,
          'icon-image': ['get', 'arrow'],
          'icon-rotation-alignment': 'map',
          ...OVERLAP,
        },
        paint: { 'icon-opacity': 0.7 },
      },
    ],
    tours: [
      ...markerLayers('tours'),
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
          // The count is drawn into the face (`CLUSTER_COUNTS`).
          'icon-image': [
            'concat',
            `${CLUSTER_FACE}|`,
            [
              'case',
              ['>', ['get', 'point_count'], 99],
              '99+',
              ['to-string', ['get', 'point_count']],
            ],
          ],
          ...OVERLAP,
        },
      },
      {
        // How many of the cluster's tours are done: ✓ alone when all are, else ✓ and the count.
        id: 'tour-cluster-done',
        source: 'tours',
        type: 'symbol',
        filter: ['all', IS_CLUSTER, ['>', ['get', 'doneW'], 0]],
        layout: {
          'icon-image': [
            'case',
            ['>=', ['get', 'doneW'], ['get', 'point_count']],
            `${DONE_PREFIX}all`,
            ['concat', DONE_PREFIX, ['to-string', ['min', ['round', ['get', 'doneW']], DONE_MAX]]],
          ],
          'icon-offset': [14, 15],
          ...OVERLAP,
        },
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
        filter: ['match', ['get', 'kind'], ['start', 'end'], true, false],
        layout: {
          'icon-image': ['match', ['get', 'kind'], 'end', END_ICON, START_ICON],
          ...OVERLAP,
        },
      },
      {
        // Where one stage of the open outing hands over to the next (D21): a small white ring.
        id: 'point-via',
        source: 'points',
        type: 'circle',
        filter: ['==', ['get', 'kind'], 'via'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-width': 3,
          'circle-stroke-color': ['coalesce', ['get', 'color'], '#334155'],
        },
      },
      {
        id: MORE_LAYER,
        source: 'points',
        type: 'symbol',
        filter: ['==', ['get', 'kind'], 'more'],
        layout: {
          'icon-image': ['get', 'image'],
          'icon-anchor': 'right',
          'icon-offset': [-18, -18],
          ...OVERLAP,
        },
      },
    ],
    focus: markerLayers('focus'),
    labels: [
      {
        // Start and end, named on whichever side is clear of the markers and the stages' names
        // (the PWA's D9).
        id: 'label-text',
        source: 'labels',
        type: 'symbol',
        filter: ['has', 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONT,
          'text-size': 11,
          'text-variable-anchor': ['top', 'bottom', 'right', 'left'],
          // Clear of its own marker's footprint, as the goals' names are of theirs.
          'text-radial-offset': 1.7,
          'text-justify': 'auto',
          'text-padding': 2,
        },
        paint: { 'text-color': '#334155', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
    ],
    focusNames: markerLayers('focus-names'),
    // Invisible footprints of the open tour's or outing's markers, placed before any name, so no
    // name lands on a marker (blank icons padded to a little inside each marker's edge, so a
    // goal's own name sits just outside it).
    footprints: [
      footprint('goal', ['all', ['==', ['get', 'kind'], 'goal'], ['!', ['get', 'selected']]], 12),
      footprint('open', ['all', ['==', ['get', 'kind'], 'goal'], ['get', 'selected']], 15),
      footprint('point', ['match', ['get', 'kind'], ['start', 'end', 'preview'], true, false], 11),
      footprint('via', ['==', ['get', 'kind'], 'via'], 6),
    ],
  };
}

function footprint(
  name: string,
  filter: ExpressionSpecification,
  padding: number,
): LayerSpecification {
  return {
    id: `label-footprint-${name}`,
    source: 'footprints',
    type: 'symbol',
    filter,
    layout: {
      'icon-image': BLANK_IMAGE,
      'icon-padding': padding,
      'icon-allow-overlap': true,
    },
  };
}

/**
 * The `labels` and `footprints` sources: the start, end and other points with their names, and
 * each open goal (`kind: 'goal'`, `selected` for the open tour's) for its footprint.
 */
export function labelPoints(
  points: GeoJSON.FeatureCollection<GeoJSON.Point> | undefined,
  focus: GeoJSON.FeatureCollection<GeoJSON.Point, { selected?: boolean }> | undefined,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: [
      ...(points?.features ?? []),
      ...(focus?.features ?? []).map((f) => ({
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: { kind: 'goal', selected: !!f.properties?.selected },
      })),
    ],
  };
}

type Padding = { top: number; right: number; bottom: number; left: number };

/**
 * Room around framed points for their markers and names (the PWA's margin; more on top: pins, more
 * at the sides: a name's second line, centred under its marker, reaches out about 80 pt).
 */
export function framePadding(padding: Padding): Padding {
  return {
    top: padding.top + space.xxxl + space.md,
    right: padding.right + space.xxxl + space.xl,
    bottom: padding.bottom + space.xxxl,
    left: padding.left + space.xxxl + space.xl,
  };
}
