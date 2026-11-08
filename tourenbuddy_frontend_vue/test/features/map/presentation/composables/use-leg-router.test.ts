import type { LngLat } from '@/features/map/domain/entities/trail'
import { describe, expect, it, vi } from 'vitest'
import { toLngLat, toUnits } from '@/features/map/domain/track-routing'
import { useLegRouter } from '@/features/map/presentation/composables/use-leg-router'

const { mockLoad } = vi.hoisted(() => ({ mockLoad: vi.fn() }))
vi.mock('@/features/map/data/services/trail-network-service', () => ({
  loadNetworkLines: mockLoad,
  TooFarError: class extends Error {},
}))

const A: LngLat = [8.42, 46.83]
/** A point `dx`, `dy` network units (~0.8 m) from A. */
const off = (dx: number, dy: number) => toLngLat([toUnits(A)[0] + dx, toUnits(A)[1] + dy])
/** A trail ~1.5 km east of A, ending ~500 m below a summit. */
const END = off(1500, 0)
const SUMMIT = off(1500, -500)

function routerOn(...trail: LngLat[]) {
  mockLoad.mockResolvedValue({ key: trail.join(), lines: [{ points: trail.map(toUnits), cost: 1 }] })
  return useLegRouter({ network: () => 'hiking', skiTemplate: async () => null })
}

describe('useLegRouter', () => {
  it('should follow the trail as far as it goes to a summit off it, then go straight up', async () => {
    const leg = await routerOn(A, END).between(A, SUMMIT)
    expect(leg.length).toBeGreaterThan(2)
    expect(leg.at(-1)).toEqual(SUMMIT)
    expect(leg.at(-2)![0]).toBeCloseTo(END[0], 4)
  })

  it('should go straight to a point between set off the ways, not reach for a trail beside it', async () => {
    // A ridge point ~120 m above a trail running along below it.
    const ridge = off(800, -150)
    const leg = await routerOn(A, END).between(A, ridge, ['stop', 'via'])
    expect(leg).toEqual([A, ridge])
  })

  it('should follow the trail from a point between that lies on it', async () => {
    const via = off(500, 0)
    const leg = await routerOn(A, END).between(via, SUMMIT, ['via', 'stop'])
    expect(leg[0]).toEqual(via)
    expect(leg.at(-2)![0]).toBeCloseTo(END[0], 4)
  })

  it('should go straight between two stops when the bits off the ways outweigh the trail', async () => {
    // Two summits ~240 m above a valley trail, ~800 m apart: down to it and back up is no way there.
    const a = off(400, -300)
    const b = off(1400, -300)
    expect(await routerOn(A, END).between(a, b)).toEqual([a, b])
  })

  it('should go straight without a bend when the only way near the stop runs elsewhere', async () => {
    // A dead-end trail far round: the leg is straight from point to point, not bent at the trail.
    const b = off(0, -1200)
    const leg = await routerOn(off(-300, -600), off(-300, -6000)).between(A, b)
    expect(leg).toEqual([A, b])
  })
})
