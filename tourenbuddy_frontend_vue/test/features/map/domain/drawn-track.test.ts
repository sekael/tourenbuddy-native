import type { LngLat } from '@/features/map/domain/entities/trail'
import { describe, expect, it } from 'vitest'
import { routeStops, trackFromLine, trackLine, withGoal } from '@/features/map/domain/drawn-track'

describe('drawnTrack', () => {
  it('should be a lone point before the first leg, and join legs without doubling their shared point', () => {
    expect(trackLine({ points: [[8, 46]], legs: [] })).toEqual([[8, 46]])
    expect(trackLine({ points: [[8, 46], [8.1, 46], [8.2, 46]], legs: [[[8, 46], [8.1, 46]], [[8.1, 46], [8.2, 46]]] }))
      .toEqual([[8, 46], [8.1, 46], [8.2, 46]])
  })

  it('should keep a long wiggly line exactly while capping the points to drag', () => {
    const line: LngLat[] = Array.from({ length: 400 }, (_, i) => [8 + i * 0.001, 46 + Math.sin(i / 3) * 0.002])
    const track = trackFromLine(line, 10)
    expect(track.points.length).toBeLessThanOrEqual(10)
    expect(track.points[0]).toEqual(line[0])
    expect(track.points.at(-1)).toEqual(line.at(-1))
    expect(trackLine(track)).toEqual(line)
  })

  it('should take a one-point line as a lone point without legs', () => {
    expect(trackFromLine([[8, 46]])).toEqual({ points: [[8, 46]], legs: [] })
  })

  it('should make the line\'s vertex nearest a goal off its points a point of its own, splitting that leg', () => {
    const leg: LngLat[] = [[8, 46], [8.003, 46], [8.005, 46.001], [8.01, 46]]
    const track = withGoal({ points: [[8, 46], [8.01, 46]], legs: [leg] }, [8.005, 46.0011])!
    expect(track.goal).toBe(1)
    expect(track.points).toEqual([[8, 46], [8.005, 46.001], [8.01, 46]])
    expect(trackLine(track)).toEqual(leg)
  })

  it('should find no route through a goal the line passes far off', () => {
    expect(withGoal({ points: [[8, 46], [8.01, 46]], legs: [[[8, 46], [8.01, 46]]] }, [8.005, 46.01])).toBeNull()
  })

  it('should have no start for a line that sets off at its goal, nor an end for one that stops there', () => {
    expect(routeStops({ points: [[8, 46], [8.1, 46]], legs: [], goal: 0 })).toMatchObject({ start: null, end: [8.1, 46] })
    expect(routeStops({ points: [[8, 46], [8.1, 46]], legs: [], goal: 1 })).toMatchObject({ start: [8, 46], end: null })
  })
})
