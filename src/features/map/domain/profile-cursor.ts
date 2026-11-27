import { haversineMeters } from '@/core/utils/haversine';

import type { LngLat } from './entities/trail';

/**
 * A place along a line's profile: where it is, how far from the start (in metres and as a share of
 * the line), and how high.
 */
export type ProfileSpot = { point: LngLat; distance: number; share: number; height: number };

/** A spot a finger or the mouse is on, in the colour of the track's activity there. */
export type ScrubSpot = ProfileSpot & { color: string };

/** The map's dot for a scrubbed spot: where, and in which colour. */
export type TrackCursor = Pick<ScrubSpot, 'point' | 'color'>;

/**
 * The spot `distance` metres along `line` (tour-info-extended "Elevation profile in the tour
 * sheet"): its place on the line, and its height between the nearest points that have one. Null
 * when the line has fewer than two heights.
 */
export function profileSpot(
  line: readonly LngLat[],
  heights: readonly (number | null)[],
  distance: number,
): ProfileSpot | null {
  if (line.length < 2) return null;
  const along = [0];
  for (let i = 1; i < line.length; i++)
    along.push(along[i - 1]! + haversineMeters(line[i - 1]!, line[i]!));
  const d = Math.min(Math.max(distance, 0), along.at(-1)!);
  const known = along
    .map((at, i) => ({ at, h: heights[i] }))
    .filter((s): s is { at: number; h: number } => s.h != null);
  if (known.length < 2) return null;

  let i = 1;
  while (i < line.length - 1 && along[i]! < d) i++;
  const [a, b] = [line[i - 1]!, line[i]!];
  const leg = along[i]! - along[i - 1]!;
  const t = leg > 0 ? (d - along[i - 1]!) / leg : 0;
  const point: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  // Before the first or past the last height, the nearest one holds.
  let j = known.findIndex((s) => s.at >= d);
  if (j === -1) j = known.length - 1;
  const [lo, hi] = [known[Math.max(0, j - 1)]!, known[j]!];
  const span = hi.at - lo.at;
  const height =
    span > 0 ? lo.h + (hi.h - lo.h) * Math.min(Math.max((d - lo.at) / span, 0), 1) : hi.h;
  return { point, distance: d, share: along.at(-1)! > 0 ? d / along.at(-1)! : 0, height };
}

/** A track's lines end to end with their heights, for its profile; null with fewer than two. */
export function trackProfile(
  lines: readonly (readonly number[])[][],
): { line: LngLat[]; heights: (number | null)[] } | null {
  const points = lines.flat();
  const heights = points.map((p) => (typeof p[2] === 'number' ? p[2] : null));
  if (heights.filter((h) => h !== null).length < 2) return null;
  return { line: points.map((p) => [p[0]!, p[1]!] as LngLat), heights };
}

/**
 * Where the cursor's label sits: a box beside the cursor line (right of it in the chart's left
 * half, else left), kept inside `[left, right]`. Its width is estimated from the text (an 11 pt
 * label of digits), so the box behind it hides the line and keeps it legible.
 */
export function cursorLabelBox(
  x: number,
  text: string,
  left: number,
  right: number,
): { x: number; width: number } {
  const width = Math.ceil(text.length * 6.2) + 10;
  const beside = x < (left + right) / 2 ? x + 6 : x - 6 - width;
  return { x: Math.min(Math.max(beside, left), right - width), width };
}
