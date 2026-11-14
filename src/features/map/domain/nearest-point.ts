/** A planar point; screen pixels for tap ordering, any projected unit for snapping. */
export type Point = readonly [number, number];

export interface NearestPoint {
  /** Euclidean distance from `p` to `point`. */
  distance: number;
  /** Closest point on the polylines. */
  point: [number, number];
  /** Index into `lines` of the polyline holding `point`. */
  lineIndex: number;
  /** Index of the segment `line[segmentIndex] → line[segmentIndex + 1]` holding `point`. */
  segmentIndex: number;
  /** Position along that segment, 0 = its start vertex, 1 = its end vertex. */
  t: number;
}

/**
 * Closest point to `p` on any segment of `lines`. Pure planar math: callers project
 * first (`map.project` for tap ordering). Returns null when there is no vertex at all.
 */
export function nearestOnPolylines(
  p: Point,
  lines: readonly (readonly Point[])[],
): NearestPoint | null {
  const [px, py] = p;
  let best: NearestPoint | null = null;
  for (const [lineIndex, line] of lines.entries()) {
    // One pass per segment (n vertices → n − 1). A single-vertex line still gets one
    // pass as a zero-length segment (a === b); an empty line gets none.
    const segments = line.length === 1 ? 1 : line.length - 1;
    for (let i = 0; i < segments; i++) {
      const [ax, ay] = line[i]!;
      const [bx, by] = line[Math.min(i + 1, line.length - 1)]!;

      // Project p onto the line through A and B: S(t) = A + t·d with d = B − A, where
      // t = ((P − A)·d) / (d·d). Clamped to [0, 1] so it stays on the segment; a
      // zero-length segment (d·d = 0) is just its vertex.
      const dx = bx - ax;
      const dy = by - ay;
      const dd = dx * dx + dy * dy;
      const t = dd === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / dd));

      const x = ax + t * dx;
      const y = ay + t * dy;
      const distance = Math.hypot(px - x, py - y);

      if (best === null || distance < best.distance)
        best = { distance, point: [x, y], lineIndex, segmentIndex: i, t };
    }
  }
  return best;
}
