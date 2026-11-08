import type { PlannedPoint, RoutePoints } from '@/features/map/domain/route-plan'
import { describe, expect, it } from 'vitest'
import { nextStep, routeClimb } from '@/features/map/domain/route-plan'

let n = 0
/** A point of its own (apart from every other), at `elevation`. */
const at = (elevation: number | null): PlannedPoint => ({ location: { lng: 8 + 0.01 * ++n, lat: 46 }, name: null, elevation, loading: false })
const route = (p: Partial<RoutePoints>): RoutePoints => ({ start: null, goal: null, end: null, ...p })

describe('nextStep', () => {
  it('should go to the goal after an end set before it', () => {
    expect(nextStep(route({ end: at(1) }), 'end')).toBe('goal')
  })

  it('should stay on a step once every later one is set', () => {
    expect(nextStep(route({ start: at(1), goal: at(2), end: at(3) }), 'start')).toBe('start')
  })

  it('should skip a set goal on the way to the end', () => {
    expect(nextStep(route({ goal: at(2) }), 'start')).toBe('end')
  })
})

describe('routeClimb', () => {
  it('should show no numbers while no leg has both heights — not 0 m', () => {
    expect(routeClimb(route({ start: at(null), goal: at(2000) }))).toBeNull()
    expect(routeClimb(route({ start: at(1000), goal: at(null) }))).toBeNull()
  })

  it('should count the leg it knows when the other lacks a height', () => {
    expect(routeClimb(route({ start: at(1000), goal: at(2500), end: at(null) }))).toEqual({ ascent: 1500, descent: 0 })
  })
})
