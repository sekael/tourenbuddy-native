import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

import type { IconName } from '@/core/adaptive/icons';
import { skiDifficultyGrade } from '@/features/map/domain/ski-difficulty';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_ICONS,
  TOUR_TYPE_VALUES,
  type TourType,
} from '@/features/tours/data/models/tour-type';

import { BUCKET_COLORS, FALLBACK_COLOR } from './marker-palette';

/**
 * The map's images by id and what each shows, for both drawers: Skia on iOS and Android
 * (`marker-images.ts`), a 2D canvas on the web (`marker-images.web.ts`). The set is finite and
 * known: activity glyphs, badges, start and end, cluster wedges and frame, ski badges, and one pie
 * per mix of colours (2^6 at most).
 */

export { BUCKET_COLORS, FALLBACK_COLOR };
/** A cluster pie is 24 steps of 15°: one wedge image per bucket and size, rotated by its layer. */
export const PIE_STEPS = 24;
export const PIE_PREFIX = 'pie|';
export const WEDGE_PREFIX = 'wedge|';
export const ACTIVITY_PREFIX = 'activity|';
export const BLANK_IMAGE = 'blank';
export const CLUSTER_SHADOW = 'cluster-shadow';
export const CLUSTER_FACE = 'cluster-face';
export const SKI_BADGE_PREFIX = 'ski-badge|';
export const COMPLETED_BADGE = 'badge-completed';
export const FRIEND_BADGE = 'badge-friend';
export const LINK_BADGE = 'badge-link';
export const START_ICON = 'detail-start';
export const END_ICON = 'detail-end';

/** Sizes in points, as the PWA's markers. */
export const MARKER_RADIUS = 14;
export const CLUSTER_RADIUS = 18;
export const CLUSTER_SIZE = CLUSTER_RADIUS * 2 + 4;
export const GLYPH = 18;
export const BADGE = 12;

/** The bucket of each activity: its colour's place in `BUCKET_COLORS`. */
export const bucketOf = (type: TourType): number => BUCKET_COLORS.indexOf(TOUR_TYPE_COLORS[type]);

/** The pie image for a tour of several colours, or null for one colour (a plain circle). */
export function pieImageId(types: readonly TourType[]): string | null {
  const weights = BUCKET_COLORS.map((_, b): number =>
    types.some((t) => bucketOf(t) === b) ? 1 : 0,
  );
  return weights.reduce((a, b) => a + b, 0) > 1 ? `${PIE_PREFIX}${weights.join(',')}` : null;
}

// --- Ski badges (port of the PWA's ski-badge.ts, via the S3 spike) ---

const GRADE_COLORS = ['#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#9333ea', '#6b21a8', '#3b0764'];
const NO_DIFFICULTY_COLOR = '#78716c';
export const SKIER_PATH =
  'M18.5 23q-.65 0-1.263-.1t-1.187-.3L2 17.475l.5-1.425l6.9 2.525l1.725-4.45L7.55 10.4q-.675-.7-.537-1.662T8 7.275l3.475-2q.425-.25.863-.288t.862.138q.425.15.738.475t.462.775l.325 1.075q.325 1.075 1.063 1.9t1.762 1.25l.525-1.6l1.425.45l-1.125 3.45q-1.85-.3-3.275-1.45T13 8.6l-2.525 1.45L13.5 13.5l-2.225 5.75l3.1 1.125l2.1-6.425q.35.125.7.225t.725.175l-2.125 6.55l.775.275q.45.15.938.237t1.012.088q.65 0 1.238-.125T20.875 21L22 22.125q-.8.425-1.675.65T18.5 23M15.088 5.913Q14.5 5.325 14.5 4.5t.588-1.412T16.5 2.5t1.413.588T18.5 4.5t-.587 1.413T16.5 6.5t-1.412-.587';
export const BADGE_HEIGHT = 24;
export const BADGE_RING = 2;
export const BADGE_SHADOW = 4;

export function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function gradeColor(grade: number | null): string {
  if (grade === null) return NO_DIFFICULTY_COLOR;
  const pos = Math.min(Math.max((grade - 1) / 3, 0), GRADE_COLORS.length - 1);
  const i = Math.floor(pos);
  return i === GRADE_COLORS.length - 1
    ? GRADE_COLORS[i]!
    : mix(GRADE_COLORS[i]!, GRADE_COLORS[i + 1]!, pos - i);
}

/** Same stops as `gradeColor`, as a style expression over the route's numeric `grade`. */
export const GRADE_COLOR_EXPRESSION = [
  'case',
  ['==', ['typeof', ['get', 'grade']], 'number'],
  ['interpolate', ['linear'], ['get', 'grade'], ...GRADE_COLORS.flatMap((c, i) => [1 + i * 3, c])],
  NO_DIFFICULTY_COLOR,
] as ExpressionSpecification;

const SAC_GRADES = ['L', 'WS', 'ZS', 'S', 'SS', 'AS', 'EX'].flatMap((g) => [`${g}-`, g, `${g}+`]);

/** What an image shows; each platform draws it its own way. */
export type MarkerDrawing =
  | { kind: 'blank' }
  | { kind: 'clusterShadow' }
  | { kind: 'clusterFace' }
  /** A small round badge on a marker's edge: green check, friend or link. */
  | { kind: 'badge'; fill: string; glyph: IconName; glyphColor: string }
  /** Start ring and finish flag, white glyph on a dark dot (the detail rows' icons). */
  | { kind: 'point'; glyph: IconName }
  /** A white activity glyph, drawn over the tour's circle. */
  | { kind: 'activity'; glyph: IconName }
  /** One bucket's share of a cluster pie, from 12 o'clock clockwise. */
  | { kind: 'wedge'; bucket: number; steps: number }
  | { kind: 'skiBadge'; label: string; color: string }
  /** Equal slices clockwise from 12 o'clock, white ring like the plain circle's stroke. */
  | { kind: 'pie'; weights: number[] };

/** Every image the map's layers can ask for. */
export function markerDrawings(): [string, MarkerDrawing][] {
  const all: [string, MarkerDrawing][] = [
    [CLUSTER_SHADOW, { kind: 'clusterShadow' }],
    [CLUSTER_FACE, { kind: 'clusterFace' }],
    [BLANK_IMAGE, { kind: 'blank' }],
    [COMPLETED_BADGE, { kind: 'badge', fill: '#15803D', glyph: 'check', glyphColor: '#ffffff' }],
    [FRIEND_BADGE, { kind: 'badge', fill: '#ffffff', glyph: 'group', glyphColor: '#1F2937' }],
    [LINK_BADGE, { kind: 'badge', fill: '#ffffff', glyph: 'link', glyphColor: '#1F2937' }],
    [START_ICON, { kind: 'point', glyph: 'trip_origin' }],
    [END_ICON, { kind: 'point', glyph: 'sports_score' }],
  ];
  for (const type of TOUR_TYPE_VALUES) {
    all.push([
      `${ACTIVITY_PREFIX}${type}`,
      { kind: 'activity', glyph: TOUR_TYPE_ICONS[type] as IconName },
    ]);
  }
  BUCKET_COLORS.forEach((_, bucket) => {
    for (let steps = 1; steps <= PIE_STEPS; steps++) {
      all.push([`${WEDGE_PREFIX}${bucket}|${steps}`, { kind: 'wedge', bucket, steps }]);
    }
  });
  for (const label of ['', ...SAC_GRADES]) {
    all.push([
      SKI_BADGE_PREFIX + label,
      { kind: 'skiBadge', label, color: gradeColor(skiDifficultyGrade(label || null)) },
    ]);
  }
  // Each mix of two or more colour buckets; the untyped grey never mixes.
  const n = BUCKET_COLORS.length - 1;
  for (let mask = 0; mask < 1 << n; mask++) {
    const weights = Array.from({ length: BUCKET_COLORS.length }, (_, b): number =>
      b < n && mask & (1 << b) ? 1 : 0,
    );
    if (weights.reduce((a, b) => a + b, 0) > 1) {
      all.push([`${PIE_PREFIX}${weights.join(',')}`, { kind: 'pie', weights }]);
    }
  }
  return all;
}
