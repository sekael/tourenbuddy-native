import { describe, expect, it } from 'vitest'
import { isSameGoal } from '@/features/tours/domain/distance'

// Swiss reference: Bern area (~46.95°N, 7.44°E)
const BASE = { lng: 7.44, lat: 46.95 }

// Approximate inverse: 1° lng ≈ 76200m in LV95 at Swiss latitudes, 1° lat ≈ 111320m
// (LV95 easting scale ~211456 per 0.0001 lngShifted unit → ~76124m/degree at 46.95°N)
function offsetByMeters(base: { lng: number, lat: number }, dE: number, dN: number) {
  return {
    lng: base.lng + dE / 76200,
    lat: base.lat + dN / 111320,
  }
}

describe('isSameGoal', () => {
  it('returns true for identical coordinates', () => {
    expect(isSameGoal(BASE, BASE)).toBe(true)
  })

  it('returns true for distance clearly under threshold (5m)', () => {
    const near = offsetByMeters(BASE, 3, 4) // 5m diagonal
    expect(isSameGoal(BASE, near)).toBe(true)
  })

  it('returns false for distance clearly over threshold (20m)', () => {
    const far = offsetByMeters(BASE, 20, 0)
    expect(isSameGoal(BASE, far)).toBe(false)
  })

  it('returns false for clearly different locations (100m apart)', () => {
    const distant = offsetByMeters(BASE, 70.7, 70.7) // ~100m diagonal
    expect(isSameGoal(BASE, distant)).toBe(false)
  })

  it('respects custom threshold', () => {
    const at15m = offsetByMeters(BASE, 15, 0)
    expect(isSameGoal(BASE, at15m, 10)).toBe(false)
    expect(isSameGoal(BASE, at15m, 20)).toBe(true)
  })
})
