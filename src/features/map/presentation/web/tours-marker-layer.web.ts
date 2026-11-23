// Ported from the PWA's features/map/presentation/components/tours-marker-layer.ts (port-pwa-web): MapLibre GL JS on the web.
import type {
  ExpressionSpecification,
  GeoJSONSource,
  LngLatLike,
  Map as MapLibreMap,
  PaddingOptions,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { RenderedNode } from './cluster-transitions.web';
import type { InternalNode, TreeNode } from './cluster-tree.web';
import type { TourType } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import type { DetailMarker } from '@/features/tours/domain/tour-detail-markers';
import * as maplibregl from 'maplibre-gl';
import { haversineMeters } from '@/core/utils/haversine';
import { TOUR_TYPE_COLORS, TOUR_TYPE_PREVIEW_COLORS } from '@/features/tours/data/models/tour-type';
import { toursToGeoJson } from '@/features/tours/domain/entities/tour';
import { routeOrder } from '@/features/tours/domain/legs';
import { moveCalmly, paddingBeside } from './frame-tour.web';
import { diffForests } from './cluster-transitions.web';
import {
  buildClusterTree,
  buildParentMap,
  CLUSTER_RADIUS,
  collectSplitZooms,
  cutForest,
  findCrossings,
} from './cluster-tree.web';
import {
  ACTIVITY_GLYPH_SIZE,
  ACTIVITY_IMAGE_PREFIX,
  activityGlyphSvg,
  BLANK_IMAGE_ID,
  COMPLETED_BADGE_ID,
  FRIEND_BADGE_ID,
  LINK_BADGE_ID,
  loadActivityGlyphs,
  loadBadges,
  loadBlankImage,
  loadSvgImage,
  whiteGlyphSvg,
} from './marker-images.web';
import {
  addTourWeight,
  createPieMarkerElement,
  cssFill,
  drawPieImage,
  drawSegmentBadge,
  fadeIn,
  fadeOut,
  FALLBACK_COLOR,
  MARKER_RADIUS,
  pieImageColors,
  pieImageId,
  segmentBadgeId,
  segmentBadgeNumber,
  tourColors,
} from './pie-marker.web';
import { createStackList } from './stack-list.web';

export { CLUSTER_RADIUS };

const SOURCE_ID = 'tours';
const PREVIEW_SOURCE_ID = 'tours-preview';
/** Layers a tap selects a tour on: the goal circles and their name labels. */
export const TOUR_LAYER_IDS = [
  'tours-circles',
  'tours-circles-selected',
  'tours-labels',
  'tours-labels-focus',
] as const;
const LAYER_ID = TOUR_LAYER_IDS[0];
const SELECTED_LAYER_ID = TOUR_LAYER_IDS[1];
const LABEL_LAYER_ID = TOUR_LAYER_IDS[2];
const FOCUS_LABEL_LAYER_ID = TOUR_LAYER_IDS[3];
const ACTIVITY_LAYER_ID = 'tours-activity';
const CHECK_LAYER_ID = 'tours-completed-check';
const FRIEND_LAYER_ID = 'tours-friend-indicator';
const LINK_LAYER_ID = 'tours-link-indicator';
const CHAIN_SOURCE_ID = 'tours-outing-chains';
const CHAIN_LAYER_ID = 'tours-outing-chains';
const DETAIL_LABEL_LAYER_ID = 'tour-detail-label';
const PREVIEW_LAYER_ID = 'tours-preview-circle';
// Split (multi-colour) fills drawn over a transparent circle, one per circle layer (D6).
const SPLIT_LAYER_ID = 'tours-split';
const SELECTED_SPLIT_LAYER_ID = 'tours-split-selected';
const DETAIL_SPLIT_LAYER_ID = 'tour-detail-split';
const PREVIEW_SPLIT_LAYER_ID = 'tours-preview-split';
const PREVIEW_LABEL_LAYER_ID = 'tours-preview-label';
// Number badges on the focused outing's segments (design D16).
const SEGMENT_BADGE_LAYER_ID = 'tours-segment-badge';
// Invisible footprints of the DOM clusters and the start/end points, placed before the names so
// a name moves aside or hides instead of running over them (D22).
const CLUSTER_SPOT_SOURCE_ID = 'tours-cluster-spots';
const CLUSTER_SPOT_LAYER_ID = 'tours-cluster-spots';
const DETAIL_SPOT_LAYER_ID = 'tour-detail-spots';

// Selection-scoped start/end detail markers — own source so they never touch
// clustering/collision; rendered beneath the goal so the goal stays on top.
const DETAIL_SOURCE_ID = 'tour-detail';
export const DETAIL_CIRCLE_LAYER_ID = 'tour-detail-circle';
const DETAIL_ICON_LAYER_ID = 'tour-detail-icon';
const START_ICON_ID = 'tour-start-icon';
const END_ICON_ID = 'tour-end-icon';
/** Everything the scene fade (D20) fades: every tour layer but the creation preview. */
const SCENE_LAYER_IDS = [
  CHAIN_LAYER_ID,
  DETAIL_CIRCLE_LAYER_ID,
  DETAIL_SPLIT_LAYER_ID,
  DETAIL_ICON_LAYER_ID,
  DETAIL_LABEL_LAYER_ID,
  LAYER_ID,
  SPLIT_LAYER_ID,
  SELECTED_LAYER_ID,
  SELECTED_SPLIT_LAYER_ID,
  ACTIVITY_LAYER_ID,
  CHECK_LAYER_ID,
  FRIEND_LAYER_ID,
  LINK_LAYER_ID,
  SEGMENT_BADGE_LAYER_ID,
  LABEL_LAYER_ID,
  FOCUS_LABEL_LAYER_ID,
];

// Shared with the goal circle so the detail circle can't visually drift from it.
const MARKER_CIRCLE_RADIUS = 14;
/** A handover ring (D21): small enough to read as a waypoint, not a destination. */
const VIA_CIRCLE_RADIUS = 6;
const SELECTED_CIRCLE_RADIUS = 18;
const PREVIEW_CIRCLE_RADIUS = 16;
const MARKER_CIRCLE_OPACITY = 0.9;
/** Name labels show from this zoom on (the selected tour's and focused segments' always). */
export const LABEL_MIN_ZOOM = 10;
/**
 * A cluster that only splits beyond this zoom holds tours metres apart: the over-zoomed base map
 * couldn't separate them usefully, so a tap lists them instead (design D6).
 */
export const STACK_ZOOM = 17;
/**
 * Least room around a tapped cluster's tours when the map frames them (more below: the tour bar).
 * They fill the middle half of the visible area unless that is smaller (D24).
 */
const CLUSTER_FIT_PADDING = { top: 64, right: 64, bottom: 112, left: 64 };
/** Least room between an opened stack list and the edges of the visible area (below: the tour bar). */
const STACK_LIST_MARGIN = { top: 64, right: 8, bottom: 112, left: 8 };
/** A list this far into its margin stays put: stacked goals metres apart anchor it a pixel off. */
const STACK_LIST_SLACK = 8;
/** A cluster tap frames its tours no closer than this, unless its split needs it (no street level). */
const CLUSTER_FIT_MAX_ZOOM = 15.5;
/** Tours this close to the selected one share its spot: its "+N" chip counts and lists them. */
const SAME_SPOT_M = 25;
const ANIMATION_DURATION_MS = 300;
/** A scene change (another tour or outing opens) fades the map's markers out, then back in (D20). */
export const SCENE_FADE_OUT_MS = 200;
export const SCENE_FADE_IN_MS = 300;
/** On the map container while the scene is faded out: hides the DOM clusters and chip too. */
const SCENE_HIDDEN_CLASS = 'tours-scene-hidden';
const OPACITY_PROPS: Partial<Record<string, string[]>> = {
  circle: ['circle-opacity', 'circle-stroke-opacity'],
  symbol: ['icon-opacity', 'text-opacity'],
  line: ['line-opacity'],
};

/** Fade one layer's opacity `prop` to `value` (`visible`) or 0 at the scene's pace (D20). */
export function fadeLayer(
  map: MapLibreMap,
  id: string,
  prop: string,
  value: unknown,
  visible: boolean,
) {
  if (!map.getLayer(id)) return;
  // maplibre-gl 6 types paint names per layer kind; these ids span kinds.
  const setPaint = map.setPaintProperty.bind(map) as (
    layer: string,
    name: string,
    value: unknown,
  ) => void;
  setPaint(id, `${prop}-transition`, {
    duration: visible ? SCENE_FADE_IN_MS : SCENE_FADE_OUT_MS,
    delay: 0,
  });
  setPaint(id, prop, visible ? value : 0);
}

const LABEL_FONT = ['Frutiger Neue Medium'];
const LABEL_SUB_FONT = ['Frutiger Neue Regular'];
const IS_SELECTED: ExpressionSpecification = ['==', ['get', 'selected'], true];

/** Localised text the layer shows; owned by the map component (i18n + formatting). */
export interface MarkerText {
  /** Label lines of a tour: its name and a "elevation · date / no date / done" line. */
  describeTour: (tour: Tour) => { name: string; sub: string };
  /** Stack-list title for `count` tours on one spot. */
  stackTitle: (count: number) => string;
  /** Accessible name of the selected tour's "+N" chip: `count` other tours at its spot. */
  stackMore: (count: number) => string;
  /** A cluster's name and hover title: its count split by status (season planning, round 5). */
  clusterSummary?: (status: {
    total: number;
    planned: number;
    undated: number;
    done: number;
  }) => string;
  closeLabel: string;
}

const DEFAULT_TEXT: MarkerText = {
  describeTour: (tour) => ({ name: tour.name ?? '', sub: '' }),
  stackTitle: (count) => String(count),
  stackMore: (count) => `+${count}`,
  closeLabel: 'Close',
};

function buildMatchExpr(
  colors: Record<TourType, string>,
  fallback: string,
): ExpressionSpecification {
  const pairs = Object.entries(colors).flatMap(([type, color]) => [type, color]);
  // `match` is a fixed-arity tuple in the MapLibre types; a runtime-length spread of
  // label/value pairs cannot satisfy it structurally, though the shape is correct.
  return [
    'match',
    ['coalesce', ['get', 'tourType'], 'unknown'],
    ...pairs,
    fallback,
  ] as unknown as ExpressionSpecification;
}

const COLOR_EXPR = buildMatchExpr(TOUR_TYPE_COLORS, '#78716C');
const PREVIEW_COLOR_EXPR = buildMatchExpr(TOUR_TYPE_PREVIEW_COLORS, '#A8A29E');

// A feature with a `pieImage` is split: its circle keeps radius, stroke and hit area but turns
// transparent, and the split layer above paints the slices (design D6).
const IS_SPLIT: ExpressionSpecification = ['to-boolean', ['get', 'pieImage']];
const TRANSPARENT = 'rgba(0,0,0,0)';
function unlessSplit(color: ExpressionSpecification): ExpressionSpecification {
  return ['case', IS_SPLIT, TRANSPARENT, color];
}

/** Symbol layer painting the split fill of a circle layer's features at that circle's `radius`. */
function addSplitLayer(
  map: MapLibreMap,
  id: string,
  source: string,
  radius: number,
  opacity: number,
  beforeId?: string,
) {
  map.addLayer(
    {
      id,
      type: 'symbol',
      source,
      filter: IS_SPLIT,
      layout: {
        'icon-image': ['get', 'pieImage'],
        // Images are drawn at MARKER_RADIUS (the largest circle) and scaled down.
        'icon-size': radius / MARKER_RADIUS,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': opacity },
    },
    beforeId,
  );
}

// Ring glyph (start) and chequered flag (end) — the form's and the detail rows' `trip_origin` /
// `sports_score` (design D22). A house would read as a hut on swisstopo maps.
const START_GLYPH_SVG =
  '<path d="M8.125 21.213q-1.825-.788-3.187-2.15t-2.15-3.188T2 11.988t.788-3.875t2.15-3.175t3.187-2.15T12.013 2t3.875.788t3.175 2.15t2.15 3.175t.787 3.875t-.787 3.887t-2.15 3.188t-3.175 2.15t-3.875.787t-3.888-.787m8.125-4.963Q18 14.5 18 12t-1.75-4.25T12 6T7.75 7.75T6 12t1.75 4.25T12 18t4.25-1.75" />';
const END_GLYPH_SVG =
  '<path d="M9 6h2V4H9zm4 0V4h2v2zm-4 8v-2h2v2zm8-4V8h2v2zm0 4v-2h2v2zm-4 0v-2h2v2zm4-8V4h2v2zm-6 2V6h2v2zM5 20V4h2v2h2v2H7v2h2v2H7v8zm10-8v-2h2v2zm-4 0v-2h2v2zm-2-2V8h2v2zm4 0V8h2v2zm2-2V6h2v2z" />';

function cubicEaseOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Pan that brings the span [lo, hi] into [min, max]: none if it lies there, centred if it can't fit. */
export function overflow(lo: number, hi: number, min: number, max: number): number {
  if (hi - lo > max - min) return (lo + hi - min - max) / 2;
  return lo < min ? lo - min : Math.max(0, hi - max);
}

interface AnimHandle {
  cancel: () => void;
}

function animateMarker(
  marker: maplibregl.Marker,
  from: [number, number],
  to: [number, number],
  durationMs: number,
  onComplete: () => void,
): AnimHandle {
  let rafId: number;
  const start = performance.now();

  function frame(now: number) {
    const t = Math.min((now - start) / durationMs, 1);
    const e = cubicEaseOut(t);
    marker.setLngLat([from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]);
    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    } else {
      onComplete();
    }
  }

  rafId = requestAnimationFrame(frame);
  return { cancel: () => cancelAnimationFrame(rafId) };
}

/**
 * A bowed arc from `a` to `b` (D8): a schematic link between two segments — a straight line
 * between goals reads as the route itself, and crosses glaciers and lakes the route doesn't.
 */
export function chainArc(a: [number, number], b: [number, number], steps = 16): [number, number][] {
  // Work in a locally square frame (a longitude degree is shorter than a latitude degree).
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dx = (b[0] - a[0]) * k;
  const dy = b[1] - a[1];
  // Control point: the midpoint pushed sideways by a fifth of the distance (clockwise bow).
  const cx = (a[0] + b[0]) / 2 + (dy * 0.2) / k;
  const cy = (a[1] + b[1]) / 2 - dx * 0.2;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [
      u * u * a[0] + 2 * u * t * cx + t * t * b[0],
      u * u * a[1] + 2 * u * t * cy + t * t * b[1],
    ];
  });
}

function makeDotEl(colors: string[]): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${cssFill(colors)};opacity:0.85;pointer-events:none;`;
  return el;
}

interface ClusterEntry {
  marker: maplibregl.Marker;
  update: (counts: Record<string, number>, total: number, done: number) => void;
  setNode: (node: InternalNode) => void;
  /** Colours, count and done badge it shows: a reused marker repaints when they change. */
  look: string;
}

export function createToursMarkerLayer(
  map: MapLibreMap,
  onTourClick: (tourId: string) => void,
  getAriaLabel: (count: number) => string,
  textOverrides: Partial<MarkerText> = {},
  /** The map area an open drawer or sheet covers: cluster taps frame beside it. */
  getCovered: () => Partial<PaddingOptions> = () => ({}),
) {
  const text = { ...DEFAULT_TEXT, ...textOverrides };
  const clusterCache = new Map<string, ClusterEntry>();
  const animatingIds = new Set<string>();
  const inflight: { handle: AnimHandle; marker: maplibregl.Marker }[] = [];

  interface TourData {
    lngLat: [number, number];
    colors: string[];
    name: string;
    sub: string;
    completed: boolean;
    plannedDate: string | null;
    type: TourType | null;
  }
  const tourDataCache = new Map<string, TourData>();
  let pieImagesHandled = false;

  let currentTree: TreeNode | null = null;
  let splitZooms: number[] = [];
  let lastSampledZoom = 0;
  let currentIndividualIds = new Set<string>();
  let currentSelectedId: string | null = null;
  /** Kept out of clustering so they always show: the selection and a focused outing's segments (D16, D2). */
  let pinnedIds = new Set<string>();
  /** The clusters' footprint points last sent to their source, so a pan doesn't resend them. */
  let clusterSpotsKey = '';
  /** Each scene layer's opacity props at full strength, read once its layers exist (D20). */
  let sceneOpacity: [layer: string, prop: string, value: unknown][] = [];
  let sceneSwaps = 0;
  let sceneTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFrame: { tree: TreeNode | null; zoom: number; byNodeId: Map<string, RenderedNode> } = {
    tree: null,
    zoom: 0,
    byNodeId: new Map(),
  };

  const reducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const stackList = createStackList(map, text.closeLabel);

  function getBboxNow(): [number, number, number, number] {
    const b = map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  function getCountsForNode(node: InternalNode): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const id of node.leafIds)
      addTourWeight(counts, tourDataCache.get(id)?.colors ?? [FALLBACK_COLOR]);
    return counts;
  }

  function doneCount(leafIds: string[]): number {
    return leafIds.filter((id) => tourDataCache.get(id)?.completed).length;
  }

  function clusterLook(node: InternalNode): string {
    return `${node.totalLeafCount}/${doneCount(node.leafIds)}/${JSON.stringify(getCountsForNode(node))}`;
  }

  function labelCluster(element: HTMLElement, leafIds: string[]) {
    const open = leafIds.map((id) => tourDataCache.get(id)).filter((d) => d && !d.completed);
    const planned = open.filter((d) => d!.plannedDate).length;
    const label = text.clusterSummary
      ? text.clusterSummary({
          total: leafIds.length,
          planned,
          undated: open.length - planned,
          done: leafIds.length - open.length,
        })
      : getAriaLabel(leafIds.length);
    element.setAttribute('aria-label', label);
    element.title = label;
  }

  function makePieTempEl(leafIds: string[]): HTMLElement {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const id of leafIds) {
      addTourWeight(counts, tourDataCache.get(id)?.colors ?? [FALLBACK_COLOR]);
      total++;
    }
    const { element } = createPieMarkerElement(counts, total);
    element.style.cssText = 'cursor:default;opacity:1;transition:none;pointer-events:none;';
    return element;
  }

  function refreshLayerFilters() {
    if (!map.getLayer(LAYER_ID)) return;

    const visibleIds = [...currentIndividualIds].filter((id) => !animatingIds.has(id));
    const inVisible: ExpressionSpecification = ['in', ['get', 'id'], ['literal', visibleIds]];
    const isSelected: ExpressionSpecification = ['==', ['get', 'id'], currentSelectedId ?? ''];
    const isFocus: ExpressionSpecification = ['any', isSelected, ['has', 'segmentBadge']];

    const unselected: ExpressionSpecification = ['all', inVisible, ['!', isSelected]];
    const selected: ExpressionSpecification = ['all', inVisible, isSelected];
    const filters: Record<string, ExpressionSpecification> = {
      [LAYER_ID]: unselected,
      [SELECTED_LAYER_ID]: selected,
      [SPLIT_LAYER_ID]: ['all', unselected, IS_SPLIT],
      [SELECTED_SPLIT_LAYER_ID]: ['all', selected, IS_SPLIT],
      [ACTIVITY_LAYER_ID]: inVisible,
      [CHECK_LAYER_ID]: ['all', inVisible, ['==', ['get', 'completed'], true]],
      // Friend badge is hidden for linked tours — the link badge takes precedence.
      [FRIEND_LAYER_ID]: [
        'all',
        inVisible,
        ['==', ['get', 'isFriendTour'], true],
        ['!=', ['get', 'isLinked'], true],
      ],
      [LINK_LAYER_ID]: ['all', inVisible, ['==', ['get', 'isLinked'], true]],
      [LABEL_LAYER_ID]: ['all', inVisible, ['!', isFocus]],
      [FOCUS_LABEL_LAYER_ID]: ['all', inVisible, isFocus],
    };
    for (const [id, filter] of Object.entries(filters)) {
      // Unchanged filters stay: `setFilter` always repaints, and this runs on `idle`, so an equal
      // filter set again would repaint → idle → repaint forever (a CPU spin, a hang on software GL).
      if (map.getLayer(id) && JSON.stringify(map.getFilter(id)) !== JSON.stringify(filter))
        map.setFilter(id, filter);
    }
  }

  function spawnTemp(
    element: HTMLElement,
    from: [number, number],
    to: [number, number],
    onComplete: () => void,
  ) {
    const marker = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(from as LngLatLike)
      .addTo(map);
    const entry = { handle: { cancel: () => {} } as AnimHandle, marker };
    const handle = animateMarker(marker, from, to, ANIMATION_DURATION_MS, () => {
      const idx = inflight.indexOf(entry);
      if (idx >= 0) inflight.splice(idx, 1);
      marker.remove();
      onComplete();
    });
    entry.handle = handle;
    inflight.push(entry);
  }

  function cancelAllAnimations() {
    for (const { handle, marker } of inflight) {
      handle.cancel();
      marker.remove();
    }
    inflight.length = 0;
    animatingIds.clear();
  }

  function classifyAppeared(
    node: TreeNode,
    oldByNodeId: Map<string, RenderedNode>,
    parentMap: Map<string, string>,
  ): { kind: 'split-from'; sourceCentroid: [number, number] } | { kind: 'created' } {
    let currentId = node.id;
    while (true) {
      const parentId = parentMap.get(currentId);
      if (!parentId) break;
      const oldParent = oldByNodeId.get(parentId);
      if (oldParent) return { kind: 'split-from', sourceCentroid: oldParent.centroid };
      currentId = parentId;
    }
    return { kind: 'created' };
  }

  function classifyDisappeared(
    node: RenderedNode,
    newByNodeId: Map<string, RenderedNode>,
  ):
    | { kind: 'merged-into'; targetCentroid: [number, number] }
    | { kind: 'split' }
    | { kind: 'deleted' } {
    for (const newNode of newByNodeId.values()) {
      if (newNode.id === node.id) continue;
      const newLeafSet = new Set(newNode.leafIds);
      if (node.leafIds.every((id) => newLeafSet.has(id)))
        return { kind: 'merged-into', targetCentroid: newNode.centroid };
    }
    // Split: leafIds spread across 2+ new nodes
    const containers = new Set<string>();
    const leafSet = new Set(node.leafIds);
    for (const newNode of newByNodeId.values()) {
      if (newNode.leafIds.some((id) => leafSet.has(id))) containers.add(newNode.id);
    }
    if (containers.size >= 2) return { kind: 'split' };
    return { kind: 'deleted' };
  }

  function stackEntry(id: string) {
    const data = tourDataCache.get(id);
    return {
      id,
      colors: data?.colors ?? [FALLBACK_COLOR],
      name: data?.name ?? '',
      sub: data?.sub ?? '',
      completed: data?.completed ?? false,
      plannedDate: data?.plannedDate ?? null,
      glyph: data?.type ? activityGlyphSvg(data.type) : null,
    };
  }

  /**
   * Open the list below the stack (`above`: upward, a tour's sheet is open below) and pan — never
   * zoom — only as far as it would run off the visible area or under the tour bar (D7, D23).
   */
  function openStack(stackId: string, at: [number, number], leafIds: string[], above = false) {
    const popup = stackList.open(
      stackId,
      at,
      leafIds.map((id) => stackEntry(id)),
      text.stackTitle(leafIds.length),
      onTourClick,
      above,
    );
    if (!popup) return;
    const box = map.getContainer().getBoundingClientRect();
    const list = popup.getBoundingClientRect();
    const pad = paddingBeside(getCovered(), STACK_LIST_MARGIN);
    const dx = overflow(
      list.left - box.left,
      list.right - box.left,
      pad.left,
      box.width - pad.right,
    );
    const dy = overflow(
      list.top - box.top,
      list.bottom - box.top,
      pad.top,
      box.height - pad.bottom,
    );
    if (Math.abs(dx) > STACK_LIST_SLACK || Math.abs(dy) > STACK_LIST_SLACK)
      map.panBy([dx, dy], { duration: reducedMotion ? 0 : 300 });
  }

  /** "+N" beside the selected tour: the others at its spot, hidden while it is open (D12, D15). */
  let selectionChip: { marker: maplibregl.Marker; el: HTMLElement; key: string } | null = null;
  function updateSelectionChip() {
    const selected = currentSelectedId ? tourDataCache.get(currentSelectedId) : undefined;
    const others = selected
      ? [...tourDataCache.entries()]
          .filter(
            ([id, d]) =>
              id !== currentSelectedId &&
              !pinnedIds.has(id) &&
              haversineMeters(d.lngLat, selected.lngLat) < SAME_SPOT_M,
          )
          .map(([id]) => id)
      : [];
    const key = others.length ? `${currentSelectedId}:${others.join()}` : '';
    if (selectionChip?.key === key) return;
    selectionChip?.marker.remove();
    selectionChip = null;
    if (!selected || !others.length) return;
    const el = document.createElement('div');
    el.className = 'selection-stack-chip';
    el.textContent = `+${others.length}`;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', text.stackMore(others.length));
    el.title = text.stackMore(others.length);
    el.style.cssText =
      'padding:2px 7px;border:1.5px solid white;border-radius:10px;background:#1F2937;color:white;font:600 11px/1.2 Inter,system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,0.35);cursor:pointer;transition:opacity 200ms ease;';
    const open = () =>
      openStack(
        `selection:${currentSelectedId}`,
        selected.lngLat,
        [currentSelectedId!, ...others],
        true,
      );
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      open();
    });
    el.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
    // Upper left: the tour's own label usually takes the right side.
    const marker = new maplibregl.Marker({ element: el, anchor: 'right', offset: [-16, -18] })
      .setLngLat(selected.lngLat as LngLatLike)
      .addTo(map);
    selectionChip = { marker, el, key };
  }

  function createClusterMarkerEntry(node: InternalNode): ClusterEntry {
    let currentNode = node;
    const counts = getCountsForNode(node);
    const { element, update } = createPieMarkerElement(
      counts,
      node.totalLeafCount,
      doneCount(node.leafIds),
    );
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    labelCluster(element, node.leafIds);

    const onExpand = () => {
      const node = currentNode;
      if (node.splitZoom > Math.min(map.getMaxZoom(), STACK_ZOOM)) {
        openStack(node.id, node.centroid, node.leafIds);
        return;
      }
      stackList.close();
      // Frame all the cluster's tours — at least past its split, so one tap always separates it.
      const lngLats = node.leafIds.map((id) => tourDataCache.get(id)?.lngLat).filter((p) => !!p);
      const lngs = lngLats.map((p) => p[0]);
      const lats = lngLats.map((p) => p[1]);
      // Beside an open drawer or sheet, not under it (D16).
      const covered = getCovered();
      // In the middle half, not out to the corners: the eye finds them without scanning (D24).
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const x = (w - (covered.left ?? 0) - (covered.right ?? 0)) / 4;
      const y = (h - (covered.top ?? 0) - (covered.bottom ?? 0)) / 4;
      const m = CLUSTER_FIT_PADDING;
      const padding = paddingBeside(covered, {
        top: Math.max(m.top, y),
        right: Math.max(m.right, x),
        bottom: Math.max(m.bottom, y),
        left: Math.max(m.left, x),
      });
      const camera = lngLats.length
        ? map.cameraForBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding },
          )
        : undefined;
      const fitZoom = Math.min(camera?.zoom ?? -Infinity, CLUSTER_FIT_MAX_ZOOM);
      // At least a level per tap: a country-wide cluster's fit barely moves the zoom (round 4).
      const zoom = Math.min(
        map.getMaxZoom(),
        Math.max(node.splitZoom + 0.01, fitZoom, map.getZoom() + 1),
      );
      // The fit's centre already sits in the uncovered area; the centroid is shifted into it.
      moveCalmly(
        map,
        zoom === fitZoom
          ? { center: camera!.center, zoom }
          : {
              center: node.centroid as LngLatLike,
              zoom,
              offset: [
                ((covered.left ?? 0) - (covered.right ?? 0)) / 2,
                ((covered.top ?? 0) - (covered.bottom ?? 0)) / 2,
              ],
            },
      );
    };

    element.addEventListener('click', (e: MouseEvent) => {
      // A DOM marker's click also bubbles into the map, which would read it as a background tap
      // and close what this tap opens (design D1).
      e.stopPropagation();
      onExpand();
    });
    element.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onExpand();
      }
    });

    const marker = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(node.centroid as LngLatLike)
      .addTo(map);

    function setNode(n: InternalNode) {
      currentNode = n;
    }
    return { marker, update, setNode, look: clusterLook(node) };
  }

  /**
   * The cluster sitting on the selected tour (the stack it was picked from) hides while it is
   * selected: the selection shows on its own, and no count that changed with the framing zoom
   * contradicts the list it was picked from (D12).
   */
  function commitFrame(newTree: TreeNode | null, newZoom: number) {
    if (!map.getSource(SOURCE_ID)) return;

    const bbox = getBboxNow();
    const forest = cutForest(newTree, newZoom, bbox);

    const newByNodeId = new Map<string, RenderedNode>();
    const newTreeById = new Map<string, TreeNode>();
    for (const node of forest) {
      const centroid = node.kind === 'leaf' ? node.coord : node.centroid;
      const leafIds = node.kind === 'leaf' ? [node.id] : node.leafIds;
      newByNodeId.set(node.id, { id: node.id, kind: node.kind, centroid, leafIds });
      newTreeById.set(node.id, node);
    }

    const { byNodeId: oldByNodeId } = lastFrame;
    const { appeared, disappeared, updated } = diffForests(oldByNodeId, forest);
    const parentMap = buildParentMap(newTree);

    // Update visible leaf set before filter refresh; pinned segments are never in the tree.
    currentIndividualIds = new Set([
      ...forest.filter((n) => n.kind === 'leaf').map((n) => n.id),
      ...pinnedIds,
    ]);

    for (const node of disappeared) {
      const clusterEntry = clusterCache.get(node.id);
      clusterCache.delete(node.id);
      const classification = classifyDisappeared(node, newByNodeId);

      if (classification.kind === 'merged-into') {
        if (reducedMotion) {
          clusterEntry?.marker.remove();
        } else if (node.kind === 'leaf') {
          const tourData = tourDataCache.get(node.id);
          if (tourData) {
            animatingIds.add(node.id);
            spawnTemp(
              makeDotEl(tourData.colors),
              node.centroid,
              classification.targetCentroid,
              () => {
                animatingIds.delete(node.id);
                refreshLayerFilters();
              },
            );
          }
        } else {
          clusterEntry?.marker.remove();
          spawnTemp(
            makePieTempEl(node.leafIds),
            node.centroid,
            classification.targetCentroid,
            () => {},
          );
        }
      } else if (classification.kind === 'split') {
        // Remove parent instantly so children fan-out is the only visible motion
        clusterEntry?.marker.remove();
      } else {
        // deleted
        if (clusterEntry) {
          if (reducedMotion) {
            clusterEntry.marker.remove();
          } else {
            fadeOut(clusterEntry.marker.getElement(), () => clusterEntry.marker.remove());
          }
        }
        // leaves just drop out of currentIndividualIds; GL filter handles visibility
      }
    }

    for (const node of appeared) {
      const treeNode = newTreeById.get(node.id);
      if (!treeNode) continue;
      const classification = classifyAppeared(treeNode, oldByNodeId, parentMap);

      if (treeNode.kind === 'internal') {
        const entry = createClusterMarkerEntry(treeNode);
        clusterCache.set(node.id, entry);

        if (!reducedMotion && classification.kind === 'split-from') {
          spawnTemp(
            makePieTempEl(treeNode.leafIds),
            classification.sourceCentroid,
            treeNode.centroid,
            () => {
              fadeIn(entry.marker.getElement());
            },
          );
        } else {
          fadeIn(entry.marker.getElement());
        }
      } else {
        // leaf
        if (!reducedMotion && classification.kind === 'split-from') {
          const tourData = tourDataCache.get(node.id);
          if (tourData) {
            animatingIds.add(node.id);
            spawnTemp(
              makeDotEl(tourData.colors),
              classification.sourceCentroid,
              treeNode.coord,
              () => {
                animatingIds.delete(node.id);
                refreshLayerFilters();
              },
            );
          }
        }
      }
    }

    for (const node of updated) {
      const treeNode = newTreeById.get(node.id);
      if (!treeNode || treeNode.kind !== 'internal') continue;
      const entry = clusterCache.get(node.id);
      if (!entry) continue;

      const oldNode = oldByNodeId.get(node.id)!;
      entry.setNode(treeNode);
      const centroidChanged =
        oldNode.centroid[0] !== treeNode.centroid[0] ||
        oldNode.centroid[1] !== treeNode.centroid[1];
      // Same leaves, but a member may have been ticked done or changed activity meanwhile.
      const look = clusterLook(treeNode);

      if (centroidChanged) {
        if (reducedMotion) {
          entry.marker.setLngLat(treeNode.centroid as LngLatLike);
        } else {
          animateMarker(
            entry.marker,
            oldNode.centroid,
            treeNode.centroid,
            ANIMATION_DURATION_MS,
            () => {},
          );
        }
      }

      if (look !== entry.look) {
        entry.update(
          getCountsForNode(treeNode),
          treeNode.totalLeafCount,
          doneCount(treeNode.leafIds),
        );
        entry.look = look;
        labelCluster(entry.marker.getElement(), treeNode.leafIds);
      }
    }

    refreshLayerFilters();
    updateClusterSpots(forest);
    lastFrame = { tree: newTree, zoom: newZoom, byNodeId: newByNodeId };
    updateSelectionChip();
  }

  function updateClusterSpots(forest: TreeNode[]) {
    const spots = forest.flatMap((n) => (n.kind === 'internal' ? [n.centroid] : []));
    const key = spots.join(';');
    if (key === clusterSpotsKey) return;
    clusterSpotsKey = key;
    map.getSource<GeoJSONSource>(CLUSTER_SPOT_SOURCE_ID)?.setData({
      type: 'FeatureCollection',
      features: spots.map((coordinates) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates },
        properties: {},
      })),
    });
  }

  /**
   * Fade every tour layer, the clusters and the chip out or back in (D20). A scene change swaps
   * the data while they are hidden, so the old stage never shows beside the new one.
   */
  function setSceneVisible(visible: boolean) {
    for (const [id, prop, value] of sceneOpacity) fadeLayer(map, id, prop, value, visible);
    map.getContainer().classList.toggle(SCENE_HIDDEN_CLASS, !visible);
    if (!visible) stackList.close();
  }

  /** Calls `done` once the tours and detail sources have drawn their latest data (or after 1 s). */
  function whenDrawn(done: () => void) {
    const drawn = () =>
      [SOURCE_ID, DETAIL_SOURCE_ID].every((id) => !map.getSource(id) || map.isSourceLoaded(id));
    const fallback = setTimeout(finish, 1000);
    map.on('render', check);
    map.triggerRepaint();

    function check() {
      if (drawn()) finish();
    }
    function finish() {
      map.off('render', check);
      clearTimeout(fallback);
      done();
    }
  }

  /**
   * Show another tour or outing (D20): fade the scene out, `draw` the next one while hidden and
   * fade it in once drawn. `fade` fades what other layers draw with it (the tracks). A swap
   * started meanwhile takes over; reduced motion draws at once.
   */
  function swapScene(draw: () => void, fade: (visible: boolean) => void = () => {}) {
    const swap = ++sceneSwaps;
    clearTimeout(sceneTimer);
    if (reducedMotion) {
      draw();
      return;
    }
    setSceneVisible(false);
    fade(false);
    sceneTimer = setTimeout(() => {
      draw();
      whenDrawn(() => {
        if (swap !== sceneSwaps) return;
        setSceneVisible(true);
        fade(true);
      });
    }, SCENE_FADE_OUT_MS);
  }

  async function setup() {
    lastSampledZoom = map.getZoom();

    // Split-marker images are drawn on first use, from the colours in their id. A style switch
    // drops every image; this handler simply draws them again. Registered once per layer.
    if (!pieImagesHandled) {
      pieImagesHandled = true;
      map.on('styleimagemissing', ({ id }) => {
        const colors = pieImageColors(id);
        const segment = segmentBadgeNumber(id);
        const pixelRatio = window.devicePixelRatio || 1;
        const image = colors
          ? drawPieImage(colors, MARKER_RADIUS, pixelRatio)
          : segment && drawSegmentBadge(segment, pixelRatio);
        if (image && !map.hasImage(id)) map.addImage(id, image, { pixelRatio });
      });
    }

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addSource(PREVIEW_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addSource(DETAIL_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addSource(CHAIN_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addSource(CLUSTER_SPOT_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    const none: ExpressionSpecification = ['in', ['get', 'id'], ['literal', []]];

    map.addLayer({
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: none,
      paint: {
        'circle-radius': MARKER_CIRCLE_RADIUS,
        'circle-color': unlessSplit(COLOR_EXPR),
        'circle-opacity': MARKER_CIRCLE_OPACITY,
        'circle-opacity-transition': { duration: 200 },
        // A white ring sets app pins apart from the base map's own symbols (D5); a focused
        // outing's segments wear a thicker one (the selected one its thickest).
        'circle-stroke-width': ['case', ['has', 'segmentBadge'], 2.5, 1.5],
        'circle-stroke-color': '#ffffff',
      },
    });

    map.addLayer({
      id: SELECTED_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: none,
      paint: {
        'circle-radius': SELECTED_CIRCLE_RADIUS,
        'circle-color': unlessSplit(COLOR_EXPR),
        'circle-opacity': 1,
        'circle-opacity-transition': { duration: 200 },
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    });

    // Unselected split fills sit under the selected circle; the selected one on top of it.
    addSplitLayer(
      map,
      SPLIT_LAYER_ID,
      SOURCE_ID,
      MARKER_CIRCLE_RADIUS,
      MARKER_CIRCLE_OPACITY,
      SELECTED_LAYER_ID,
    );
    addSplitLayer(map, SELECTED_SPLIT_LAYER_ID, SOURCE_ID, SELECTED_CIRCLE_RADIUS, 1);

    // Start/end detail markers — inserted BEFORE the goal circle so the goal
    // always stacks on top when they overlap. Circle mirrors the goal's paint
    // constants; the draft tone uses the lighter preview palette.
    // An outing's handover (`via`) is a small white ring in its next segment's colour (D21).
    const IS_VIA: ExpressionSpecification = ['==', ['get', 'pointKind'], 'via'];
    map.addLayer(
      {
        id: DETAIL_CIRCLE_LAYER_ID,
        type: 'circle',
        source: DETAIL_SOURCE_ID,
        paint: {
          'circle-radius': ['case', IS_VIA, VIA_CIRCLE_RADIUS, MARKER_CIRCLE_RADIUS],
          'circle-color': [
            'case',
            IS_VIA,
            '#ffffff',
            unlessSplit(['case', ['get', 'draft'], PREVIEW_COLOR_EXPR, COLOR_EXPR]),
          ],
          'circle-opacity': MARKER_CIRCLE_OPACITY,
          'circle-stroke-width': ['case', IS_VIA, 3, 1.5],
          'circle-stroke-color': ['case', IS_VIA, COLOR_EXPR, '#ffffff'],
        },
      },
      LAYER_ID,
    );
    addSplitLayer(
      map,
      DETAIL_SPLIT_LAYER_ID,
      DETAIL_SOURCE_ID,
      MARKER_CIRCLE_RADIUS,
      MARKER_CIRCLE_OPACITY,
      LAYER_ID,
    );

    // Outing chains run beneath every marker (D8). Round dots, not dashes: dashed dark lines are
    // footpaths on a Swisstopo map.
    map.addLayer(
      {
        id: CHAIN_LAYER_ID,
        type: 'line',
        source: CHAIN_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#1F2937',
          'line-opacity': 0.75,
          'line-width': 4,
          'line-dasharray': [0, 2],
        },
      },
      DETAIL_CIRCLE_LAYER_ID,
    );

    const [startLoaded, endLoaded] = await Promise.all([
      loadSvgImage(map, START_ICON_ID, whiteGlyphSvg(START_GLYPH_SVG), 24),
      loadSvgImage(map, END_ICON_ID, whiteGlyphSvg(END_GLYPH_SVG), 24),
    ]);
    if (startLoaded && endLoaded) {
      map.addLayer(
        {
          id: DETAIL_ICON_LAYER_ID,
          type: 'symbol',
          source: DETAIL_SOURCE_ID,
          filter: ['!=', ['get', 'pointKind'], 'via'],
          layout: {
            'icon-image': ['match', ['get', 'pointKind'], 'end', END_ICON_ID, START_ICON_ID],
            'icon-size': 0.7,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        },
        LAYER_ID,
      );
    }
    // "Startpunkt" / "Endpunkt" under the detail circles (D9).
    map.addLayer({
      id: DETAIL_LABEL_LAYER_ID,
      type: 'symbol',
      source: DETAIL_SOURCE_ID,
      filter: ['has', 'label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['literal', LABEL_FONT],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 1.4],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#1c1917', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    });

    map.addLayer({
      id: PREVIEW_LAYER_ID,
      type: 'circle',
      source: PREVIEW_SOURCE_ID,
      paint: {
        'circle-radius': PREVIEW_CIRCLE_RADIUS,
        'circle-color': unlessSplit(PREVIEW_COLOR_EXPR),
        'circle-opacity': 0.9,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    });
    addSplitLayer(map, PREVIEW_SPLIT_LAYER_ID, PREVIEW_SOURCE_ID, PREVIEW_CIRCLE_RADIUS, 0.9);
    // "Ziel" under a tour-in-creation's goal, like "Startpunkt" under its start (map-first-tour-creation).
    map.addLayer({
      id: PREVIEW_LABEL_LAYER_ID,
      type: 'symbol',
      source: PREVIEW_SOURCE_ID,
      filter: ['has', 'label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['literal', LABEL_FONT],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 1.8],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#1c1917', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    });

    // The primary activity's white glyph, centred in the goal circle (D5). The symbol also claims
    // the circle's footprint in label placement, so a base-map summit pictogram or label under a
    // marker gives way instead of peeking out as a second, dark "marker" (untyped: a blank image).
    await Promise.all([loadActivityGlyphs(map), loadBlankImage(map)]);
    map.addLayer({
      id: ACTIVITY_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: none,
      layout: {
        'icon-image': ['coalesce', ['get', 'activityImage'], BLANK_IMAGE_ID],
        'icon-size': ['case', IS_SELECTED, 1.25, 1],
        'icon-allow-overlap': true,
        // Footprint ≈ the circle and its corner badges: the 18 px glyph plus padding each side.
        'icon-padding': 6,
      },
    });

    // Corner badges on the circle's edge: done lower right, friend / link lower left (D5).
    const badges = await loadBadges(map);
    const corner = (x: number): ExpressionSpecification => [
      'case',
      IS_SELECTED,
      ['literal', [x * 14, 14]],
      ['literal', [x * 11, 11]],
    ];
    const addBadgeLayer = (id: string, image: string, x: number) =>
      map.addLayer({
        id,
        type: 'symbol',
        source: SOURCE_ID,
        filter: none,
        layout: {
          'icon-image': image,
          'icon-offset': corner(x),
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    if (badges.friend) addBadgeLayer(FRIEND_LAYER_ID, FRIEND_BADGE_ID, -1);
    if (badges.link) addBadgeLayer(LINK_LAYER_ID, LINK_BADGE_ID, -1);
    if (badges.completed) addBadgeLayer(CHECK_LAYER_ID, COMPLETED_BADGE_ID, 1);

    map.addLayer({
      id: SEGMENT_BADGE_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'segmentBadge'],
      layout: {
        'icon-image': ['get', 'segmentBadge'],
        'icon-offset': [12, -12],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    // Names sit below the glyphs, the start/end labels and the footprints, which MapLibre places
    // first (top down): a name takes an anchor clear of every marker, or hides (D22). Above the
    // base map all the same, so its labels give way to them (D4).
    const labelLayout: SymbolLayerSpecification['layout'] = {
      'text-field': [
        'format',
        ['get', 'label'],
        { 'text-font': ['literal', LABEL_FONT] },
        '\n',
        {},
        ['get', 'labelSub'],
        { 'text-font': ['literal', LABEL_SUB_FONT], 'font-scale': 0.85, 'text-color': '#44403c' },
      ] as ExpressionSpecification,
      // Also the layout font: without it MapLibre requests its Open Sans default, which the
      // Swisstopo glyph server doesn't have.
      'text-font': ['literal', LABEL_FONT],
      'text-size': 13,
      'text-max-width': 12,
      'text-line-height': 1.15,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      // Clear of the circle: 14 px radius (18 selected) + a few px, in ems of the 13 px text.
      'text-radial-offset': ['case', IS_SELECTED, 1.75, 1.45],
      'text-justify': 'auto',
      'text-padding': 3,
    };
    const labelPaint = {
      'text-color': '#1c1917',
      'text-halo-color': 'rgba(255,255,255,0.95)',
      'text-halo-width': 1.6,
      'text-halo-blur': 0.4,
    };
    map.addLayer(
      {
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        minzoom: LABEL_MIN_ZOOM,
        filter: none,
        layout: labelLayout,
        paint: labelPaint,
      },
      DETAIL_LABEL_LAYER_ID,
    );
    map.addLayer(
      {
        id: FOCUS_LABEL_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: none,
        layout: labelLayout,
        paint: labelPaint,
      },
      DETAIL_LABEL_LAYER_ID,
    );

    // Blank icons, each padded out to its marker's radius (the image is ACTIVITY_GLYPH_SIZE wide).
    const addSpotLayer = (id: string, source: string, padding: number | ExpressionSpecification) =>
      map.addLayer({
        id,
        type: 'symbol',
        source,
        layout: {
          'icon-image': BLANK_IMAGE_ID,
          'icon-allow-overlap': true,
          'icon-padding': padding,
        },
      });
    addSpotLayer(
      CLUSTER_SPOT_LAYER_ID,
      CLUSTER_SPOT_SOURCE_ID,
      MARKER_RADIUS + 2 - ACTIVITY_GLYPH_SIZE / 2,
    );
    addSpotLayer(DETAIL_SPOT_LAYER_ID, DETAIL_SOURCE_ID, [
      'case',
      IS_VIA,
      0,
      MARKER_CIRCLE_RADIUS + 2 - ACTIVITY_GLYPH_SIZE / 2,
    ]);

    sceneOpacity = SCENE_LAYER_IDS.flatMap((id) => {
      const type = map.getLayer(id)?.type;
      return (OPACITY_PROPS[type ?? ''] ?? []).map(
        (prop) =>
          [id, prop, map.getPaintProperty(id, prop as never) ?? 1] as [string, string, unknown],
      );
    });

    // A tap on a goal circle or its label selects the tour.
    for (const id of TOUR_LAYER_IDS) {
      map.on('click', id, (e) => {
        const feature = e.features?.[0];
        if (feature?.properties?.id) onTourClick(feature.properties.id as string);
      });
      map.on('mouseenter', id, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', id, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    map.on('move', () => commitFrame(currentTree, map.getZoom()));
    map.on('moveend', () => commitFrame(currentTree, map.getZoom()));
    map.on('zoom', () => {
      const newZoom = map.getZoom();
      const crossings = findCrossings(splitZooms, lastSampledZoom, newZoom);
      if (crossings.length > 0) commitFrame(currentTree, newZoom);
      lastSampledZoom = newZoom;
    });
    map.on('idle', () => commitFrame(currentTree, map.getZoom()));

    map.on('zoomstart', () => {
      stackList.close();
      cancelAllAnimations();
      lastSampledZoom = map.getZoom();
    });

    map.on('zoomend', () => {
      const newZoom = map.getZoom();
      commitFrame(currentTree, newZoom);
      lastSampledZoom = newZoom;
    });
  }

  /** `segmentIds`: the focused outing's segments in order — pinned, ringed and numbered. */
  function updateTours(
    tours: Tour[],
    selectedTourId: string | null,
    linkedTourIds: Set<string> = new Set(),
    segmentIds: string[] = [],
  ) {
    const source = map.getSource<GeoJSONSource>(SOURCE_ID);
    if (!source) return;

    cancelAllAnimations();

    tourDataCache.clear();
    for (const tour of tours) {
      const { name, sub } = text.describeTour(tour);
      tourDataCache.set(tour.id, {
        lngLat: [tour.goal.lng, tour.goal.lat],
        colors: tourColors(routeOrder(tour), TOUR_TYPE_COLORS),
        name,
        sub,
        completed: tour.completed ?? false,
        plannedDate: tour.plannedDate?.toISOString() ?? null,
        type: tour.tourTypes[0] ?? null,
      });
    }

    pinnedIds = new Set(selectedTourId ? [...segmentIds, selectedTourId] : segmentIds);
    // An open tour or outing is all the map shows (D15). The cache keeps every tour for its chip.
    const focused = tours.filter((t) => pinnedIds.has(t.id));
    currentTree = buildClusterTree(focused.length ? [] : tours);
    splitZooms = collectSplitZooms(currentTree);
    currentSelectedId = selectedTourId;

    const geoJson = toursToGeoJson(focused.length ? focused : tours, { linkedTourIds });
    for (const feature of geoJson.features) {
      const props = feature.properties!;
      const id = props.id as string;
      const data = tourDataCache.get(id)!;
      props.pieImage = pieImageId(data.colors);
      props.selected = id === selectedTourId;
      props.label = data.name;
      props.labelSub = data.sub;
      if (props.tourType) props.activityImage = `${ACTIVITY_IMAGE_PREFIX}${props.tourType}`;
      if (segmentIds.includes(id)) props.segmentBadge = segmentBadgeId(segmentIds.indexOf(id) + 1);
    }
    source.setData(geoJson);
    commitFrame(currentTree, map.getZoom());
  }

  /** The tentative goals: an edited tour's re-picked one, or every stage's of a tour being created (labelled). */
  function updatePreview(
    goals: { goal: { lng: number; lat: number }; tourTypes: TourType[]; label?: string }[],
  ) {
    const source = map.getSource<GeoJSONSource>(PREVIEW_SOURCE_ID);
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: goals.map(({ goal, tourTypes, label }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [goal.lng, goal.lat] },
        properties: {
          tourType: tourTypes[0] ?? null,
          pieImage: pieImageId(tourColors(tourTypes, TOUR_TYPE_PREVIEW_COLORS)),
          ...(label ? { label } : {}),
        },
      })),
    });
  }

  /** `labels`: the start / end point names (handover rings get none). */
  function updateDetailMarkers(
    markers: DetailMarker[],
    labels: { start: string; end: string } = { start: '', end: '' },
  ) {
    const source = map.getSource<GeoJSONSource>(DETAIL_SOURCE_ID);
    if (!source) return;

    source.setData({
      type: 'FeatureCollection',
      features: markers.map((m) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.lngLat.lng, m.lngLat.lat] },
        properties: {
          pointKind: m.pointKind,
          ...(m.pointKind !== 'via' && labels[m.pointKind] ? { label: labels[m.pointKind] } : {}),
          tourType: m.tourTypes[0] ?? null,
          draft: m.draft,
          // ponytail: a handover ring takes the primary colour only, no split.
          pieImage:
            m.pointKind === 'via'
              ? null
              : pieImageId(
                  tourColors(m.tourTypes, m.draft ? TOUR_TYPE_PREVIEW_COLORS : TOUR_TYPE_COLORS),
                ),
        },
      })),
    });
  }

  /** Dotted arcs through each unopened outing's segment goals, in order (D8). */
  function updateOutingChains(chains: [number, number][][]) {
    map.getSource<GeoJSONSource>(CHAIN_SOURCE_ID)?.setData({
      type: 'FeatureCollection',
      features: chains.flatMap((chain) =>
        chain.slice(1).map((to, i) => ({
          type: 'Feature' as const,
          geometry: { type: 'LineString' as const, coordinates: chainArc(chain[i]!, to) },
          properties: {},
        })),
      ),
    });
  }

  function cleanup() {
    clearTimeout(sceneTimer);
    sceneSwaps++;
    map.getContainer().classList.remove(SCENE_HIDDEN_CLASS);
    clusterSpotsKey = '';
    stackList.close();
    selectionChip?.marker.remove();
    selectionChip = null;
    cancelAllAnimations();
    for (const { marker } of clusterCache.values()) {
      marker.remove();
    }
    clusterCache.clear();
    currentTree = null;
    lastFrame = { tree: null, zoom: 0, byNodeId: new Map() };
    splitZooms = [];
  }

  return {
    setup,
    updateTours,
    updatePreview,
    updateDetailMarkers,
    updateOutingChains,
    swapScene,
    cleanup,
  };
}
