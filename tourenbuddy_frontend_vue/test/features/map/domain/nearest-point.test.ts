import { describe, expect, it } from 'vitest'
import { nearestOnPolylines } from '@/features/map/domain/nearest-point'

describe('nearestOnPolylines', () => {
  it('should return null for no lines or only empty lines', () => {
    expect(nearestOnPolylines([0, 0], [])).toBeNull()
    expect(nearestOnPolylines([0, 0], [[]])).toBeNull()
  })

  it('should handle a single-vertex line as a point', () => {
    const r = nearestOnPolylines([3, 4], [[[0, 0]]])!
    expect(r.distance).toBeCloseTo(5)
    expect(r.point).toEqual([0, 0])
  })

  it('should not divide by zero on a zero-length segment', () => {
    const r = nearestOnPolylines([3, 4], [[[0, 0], [0, 0]]])!
    expect(r.distance).toBeCloseTo(5)
    expect(Number.isNaN(r.t)).toBe(false)
  })

  it('should clamp the projection to the segment ends', () => {
    const before = nearestOnPolylines([-5, 1], [[[0, 0], [10, 0]]])!
    expect(before.point).toEqual([0, 0])
    expect(before.t).toBe(0)
    const after = nearestOnPolylines([15, 1], [[[0, 0], [10, 0]]])!
    expect(after.point).toEqual([10, 0])
    expect(after.t).toBe(1)
  })

  it('should pick the closest part of a multi-line and report where it is', () => {
    const lines = [
      [[0, 10], [10, 10]],
      [[0, 0], [4, 0], [8, 0]],
    ] as const
    const r = nearestOnPolylines([6, 1], lines)!
    expect(r.lineIndex).toBe(1)
    expect(r.segmentIndex).toBe(1)
    expect(r.t).toBeCloseTo(0.5)
    expect(r.point[0]).toBeCloseTo(6)
    expect(r.point[1]).toBeCloseTo(0)
    expect(r.distance).toBeCloseTo(1)
  })
})
