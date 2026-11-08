import type { NetworkLine, Pt } from '@/features/map/domain/track-routing'
import { describe, expect, it } from 'vitest'
import { buildNetwork, routeBetween, routeToTap, snapTo, toLngLat, toUnits } from '@/features/map/domain/track-routing'

const line = (points: Pt[], cost = 1): NetworkLine => ({ points, cost })
function route(lines: NetworkLine[], from: Pt, to: Pt, join = 3, bridge = join) {
  const net = buildNetwork(lines, join, bridge)
  const [a, b] = [snapTo(net, from, 10), snapTo(net, to, 10)]
  return a && b ? routeBetween(net, a, b)?.points ?? null : null
}

describe('trackRouting', () => {
  it('should round-trip a point through network units', () => {
    const [lng, lat] = toLngLat(toUnits([8.4275, 46.7311]))
    expect(lng).toBeCloseTo(8.4275, 9)
    expect(lat).toBeCloseTo(46.7311, 9)
  })

  it('should not snap a point beyond the radius', () => {
    const net = buildNetwork([line([[0, 0], [100, 0]])], 3)
    expect(snapTo(net, [50, 11], 10)).toBeNull()
  })

  it('should join a path that ends on a way without a shared vertex (simplified T-junction)', () => {
    const path = route([line([[0, 0], [100, 0]]), line([[50, 2], [50, 100]])], [0, 0], [50, 100])
    expect(path).not.toBeNull()
    expect(path!.at(-1)).toEqual([50, 100])
    // Through the cut on the way, not around via its ends.
    expect(path!.some(([x, y]) => x === 50 && y === 0)).toBe(true)
  })

  it('should join a way cut at a tile edge to its continuation in the next tile', () => {
    // Tile A clips at x = 64.5 (a synthetic end); tile B holds the original vertices.
    const path = route([line([[0, 0], [40, 0], [64.5, 0.4]]), line([[60, 0], [200, 0]])], [0, 0], [200, 0])
    expect(path).not.toBeNull()
  })

  it('should give no way between networks farther apart than the join distance', () => {
    expect(route([line([[0, 0], [100, 0]]), line([[0, 20], [100, 20]])], [0, 0], [100, 20])).toBeNull()
  })

  it('should let a line reach its own join across, never stretching the others\' (ski route down to a road)', () => {
    // The ski route stops 15 units above the road: its own 20 reach it, the network's 3 don't.
    const ski = { ...line([[50, 100], [50, 15]]), join: 20 }
    expect(route([line([[0, 0], [100, 0]]), ski], [50, 100], [100, 0], 3, 3)).not.toBeNull()
    expect(route([line([[0, 0], [100, 0]]), line([[50, 100], [50, 15]])], [50, 100], [100, 0], 3, 3)).toBeNull()
  })

  it('should cross the gap from a street\'s loose end to the trail instead of going round by the far junction', () => {
    const trail = line([[0, 0], [0, 300]])
    // Stops 20 short of the trail; meets it again only at (0, 300).
    const street = line([[20, 50], [100, 50], [100, 300], [0, 300]], 1.5)
    const path = route([trail, street], [0, 40], [100, 60], 3, 30)
    expect(path).toContainEqual([20, 50])
    expect(path).not.toContainEqual([0, 300])
  })

  it('should not bridge to a way that only passes near, with both its ends far off', () => {
    // Its middle dips to 20 above the other's; every end stays over 40 off.
    expect(route([line([[0, 0], [100, 0]]), line([[-50, 80], [50, 20], [150, 80]])], [0, 0], [150, 80], 3, 30)).toBeNull()
  })

  it('should keep to the trail over a shorter unmarked way, unless the detour costs more', () => {
    const trail = line([[0, 0], [50, 40], [100, 0]])
    const shortcut = line([[0, 0], [100, 0]], 1.5)
    // Trail ≈ 128, shortcut 100 × 1.5 = 150: the trail wins.
    expect(route([trail, shortcut], [0, 0], [100, 0])).toContainEqual([50, 40])
    const longTrail = line([[0, 0], [50, 90], [100, 0]])
    expect(route([longTrail, shortcut], [0, 0], [100, 0])).not.toContainEqual([50, 90])
  })

  it('should go straight along the segment when both points snap to the same one', () => {
    expect(route([line([[0, 0], [100, 0]])], [10, 1], [90, 1])).toEqual([[10, 0], [90, 0]])
  })

  it('should land a tap between a road and a side path on the road it came by, not hook back from the path', () => {
    // A road north to south; a side path leaves it at (0, 100) and runs back up beside it.
    const road = line([[0, 0], [0, 100]])
    const side = line([[0, 100], [3, 60]])
    const net = buildNetwork([road, side], 1)
    const from = snapTo(net, [0, 0], 10)!
    const tap: Pt = [2, 62]
    // The side path is the nearest way to the tap…
    expect(snapTo(net, tap, 10)!.segment).toBe(net.segments.findIndex(s => s.b !== s.a && net.nodes[s.b]![0] === 3))
    // …but the route lands on the road, without running to (0, 100) and back.
    const route = routeToTap(net, from, tap, 10, 4)!
    expect(route.points.at(-1)![0]).toBe(0)
    expect(route.points.some(([, y]) => y === 100)).toBe(false)
  })
})
