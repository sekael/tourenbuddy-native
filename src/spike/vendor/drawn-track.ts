import type { LngLat } from './trail'
import { haversineMeters } from './haversine'

/** A track drawn on the map: the points the user set and the way between each two. */
export interface DrawnTrack {
  points: LngLat[]
  /** `legs[i]` runs from `points[i]` to `points[i + 1]`, both ends included. */
  legs: LngLat[][]
  /**
   * The tour's route (map-first-tour-creation D9): `points[goal]` is its goal, the first point its
   * start and the last its end, unless the goal is that point. Absent: a line without its stops.
   */
  goal?: number
}

/** The same way back to the start, exactly: every point and leg again, the other way round. */
export function withWayBack({ points, legs, goal }: DrawnTrack): DrawnTrack {
  return {
    points: [...points, ...points.slice(0, -1).reverse()],
    legs: [...legs, ...[...legs].reverse().map(leg => [...leg].reverse())],
    goal,
  }
}

/** A route's start, goal and end as its track has them. */
export function routeStops({ points, goal }: DrawnTrack & { goal: number }) {
  return {
    start: goal > 0 ? points[0]! : null,
    goal: points[goal]!,
    end: goal < points.length - 1 ? points.at(-1)! : null,
  }
}

/**
 * The track as the route to `goal`: its point nearest the goal becomes the goal — a point of the
 * line within `near` metres is made one when no point is. Null when the line passes farther off.
 */
export function withGoal(track: DrawnTrack, goal: LngLat, near = 200): DrawnTrack | null {
  if (track.goal != null)
    return track
  const nearest = (line: readonly LngLat[]) => line.reduce<{ i: number, d: number }>((best, p, i) => {
    const d = haversineMeters(p, goal)
    return d < best.d ? { i, d } : best
  }, { i: -1, d: near })
  const point = nearest(track.points)
  if (point.i >= 0)
    return { ...track, goal: point.i }
  let best: { k: number, i: number, d: number } | null = null
  for (const [k, leg] of track.legs.entries()) {
    const { i, d } = nearest(leg)
    if (i > 0 && i < leg.length - 1 && d < (best?.d ?? near))
      best = { k, i, d }
  }
  if (best) {
    const { k, i } = best
    const leg = track.legs[k]!
    return {
      points: [...track.points.slice(0, k + 1), leg[i]!, ...track.points.slice(k + 1)],
      legs: [...track.legs.slice(0, k), leg.slice(0, i + 1), leg.slice(i), ...track.legs.slice(k + 1)],
      goal: k + 1,
    }
  }
  return null
}

export const EMPTY_TRACK: DrawnTrack = { points: [], legs: [] }

/** The same route: the same points, the same way between them, the same goal. */
export function sameTrack(a: DrawnTrack, b: DrawnTrack): boolean {
  const flat = ({ points, legs, goal }: DrawnTrack) => JSON.stringify([points, legs, goal ?? null])
  return flat(a) === flat(b)
}

/** The whole line, leg after leg; a lone point is a line of one. */
export function trackLine({ points, legs }: DrawnTrack): LngLat[] {
  if (legs.length === 0)
    return points.slice(0, 1)
  return legs.flatMap((leg, i) => (i === 0 ? leg : leg.slice(1)))
}

/** Metres along the line. */
export function lineLength(line: readonly LngLat[]): number {
  return line.reduce((sum, p, i) => (i > 0 ? sum + haversineMeters(line[i - 1]!, p) : sum), 0)
}

/** The point `share` (0–1) of the way along `line`. */
export function pointAlong(line: readonly LngLat[], share: number): LngLat {
  let left = lineLength(line) * share
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1]!, line[i]!]
    const step = haversineMeters(a, b)
    if (step >= left && step > 0) {
      const t = left / step
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    left -= step
  }
  return line.at(-1)!
}

/** Distance in metres from `p` to the segment `a`–`b`, on a local flat projection. */
function offset(p: LngLat, a: LngLat, b: LngLat): number {
  const k = Math.cos(p[1] * Math.PI / 180)
  const [ax, ay, bx, by, px, py] = [a[0] * k, a[1], b[0] * k, b[1], p[0] * k, p[1]]
  const dx = bx - ax
  const dy = by - ay
  const dd = dx * dx + dy * dy
  const t = dd === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / dd))
  return haversineMeters(p, [(ax + t * dx) / k, ay + t * dy])
}

/** Indices Douglas–Peucker keeps at `tolerance` metres. */
function keep(line: readonly LngLat[], tolerance: number): number[] {
  const kept = new Set([0, line.length - 1])
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length > 0) {
    const [from, to] = stack.pop()!
    let far = -1
    let farthest = tolerance
    for (let i = from + 1; i < to; i++) {
      const d = offset(line[i]!, line[from]!, line[to]!)
      if (d > farthest) {
        farthest = d
        far = i
      }
    }
    if (far >= 0) {
      kept.add(far)
      stack.push([from, far], [far, to])
    }
  }
  return [...kept].sort((a, b) => a - b)
}

/**
 * An existing line (an uploaded or saved track) as a drawing to edit: its turning points become
 * the points to drag, at most `maxPoints`; the legs keep the line exactly as it was.
 */
export function trackFromLine(line: readonly LngLat[], maxPoints = 10): DrawnTrack {
  if (line.length < 2)
    return { points: [...line], legs: [] }
  let tolerance = 40
  let indices = keep(line, tolerance)
  while (indices.length > maxPoints) {
    tolerance *= 2
    indices = keep(line, tolerance)
  }
  return {
    points: indices.map(i => line[i]!),
    legs: indices.slice(1).map((end, k) => line.slice(indices[k]!, end + 1)),
  }
}
