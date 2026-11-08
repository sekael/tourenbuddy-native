import type { Tour } from '@/features/tours/domain/entities/tour'
import { describe, expect, it } from 'vitest'
import { haversineMeters } from '@/core/utils/haversine'
import {
  buildClusterTree,
  collectSplitZooms,
  cutForest,
  findCrossings,
  solveSplitZoom,
} from '@/features/map/presentation/components/cluster-tree'
import { TOUR_FILL } from '../../../../fixtures/tour-fill'

function makeTour(id: string, lng: number, lat: number): Tour {
  return {
    ...TOUR_FILL,
    id,
    userId: 'user-1',
    plannedDate: null,
    goal: { lng, lat },
    name: null,
    partnerIds: [],
    tourTypes: [],
    elevation: null,
    gpxFilepath: null,
    description: null,
    seasons: null,
    startPoint: null,
    endPoint: null,
    startPointName: null,
    startPointElevation: null,
    endPointName: null,
    endPointElevation: null,
    equipment: null,
    notes: null,
    completed: false,
  }
}

describe('buildClusterTree', () => {
  it('should return null for empty tour list', () => {
    expect(buildClusterTree([])).toBeNull()
  })

  it('should return leaf node as root for single tour', () => {
    const root = buildClusterTree([makeTour('a', 8.0, 47.0)])
    expect(root).not.toBeNull()
    expect(root!.kind).toBe('leaf')
    expect(root!.id).toBe('a')
  })

  it('should produce internal node with correct splitZoom for two tours', () => {
    const t1 = makeTour('a', 8.0, 47.0)
    const t2 = makeTour('b', 8.1, 47.0)
    const root = buildClusterTree([t1, t2])

    expect(root).not.toBeNull()
    expect(root!.kind).toBe('internal')

    const node = root as import('@/features/map/presentation/components/cluster-tree').InternalNode
    const dist = haversineMeters([8.0, 47.0], [8.1, 47.0])
    const expected = solveSplitZoom(dist, node.centroid[1], 50)
    expect(node.splitZoom).toBeCloseTo(expected, 5)
  })

  it('should build tree in greedy-closest-pair order for 4 tours', () => {
    // Place pairs clearly: A-B close together, C-D close together, pairs far apart
    const tA = makeTour('A', 8.0, 47.0)
    const tB = makeTour('B', 8.001, 47.0) // ~78m from A
    const tC = makeTour('C', 9.0, 47.0) // ~78km from A-B
    const tD = makeTour('D', 9.001, 47.0) // ~78m from C

    const root = buildClusterTree([tA, tB, tC, tD])
    expect(root!.kind).toBe('internal')

    const top = root as import('@/features/map/presentation/components/cluster-tree').InternalNode
    // Root has two children, each should be a pair
    const childA = top.children[0]
    const childB = top.children[1]

    // One child contains A and B, the other C and D
    const childALeafs = childA.kind === 'leaf' ? [childA.id] : childA.leafIds.sort()
    const childBLeafs = childB.kind === 'leaf' ? [childB.id] : childB.leafIds.sort()

    const allLeafs = [...childALeafs, ...childBLeafs].sort()
    expect(allLeafs).toEqual(['A', 'B', 'C', 'D'])

    // Each child should be an internal node (pair cluster)
    expect(childA.kind).toBe('internal')
    expect(childB.kind).toBe('internal')
    const pairA = (childA as import('@/features/map/presentation/components/cluster-tree').InternalNode).leafIds.sort()
    const pairB = (childB as import('@/features/map/presentation/components/cluster-tree').InternalNode).leafIds.sort()
    const pairs = [pairA, pairB].sort((a, b) => a[0]!.localeCompare(b[0]!))
    expect(pairs[0]).toEqual(['A', 'B'])
    expect(pairs[1]).toEqual(['C', 'D'])
  })

  it('should enforce monotonicity: child.splitZoom >= parent.splitZoom', () => {
    const tours = [
      makeTour('a', 8.0, 47.0),
      makeTour('b', 8.001, 47.0),
      makeTour('c', 8.0005, 47.0), // between a and b, causes non-monotone case
    ]
    const root = buildClusterTree(tours)
    expect(root).not.toBeNull()

    function checkMonotonicity(
      node: import('@/features/map/presentation/components/cluster-tree').TreeNode,
      minZoom: number,
    ): void {
      if (node.kind === 'internal') {
        expect(node.splitZoom).toBeGreaterThanOrEqual(minZoom)
        checkMonotonicity(node.children[0], node.splitZoom)
        checkMonotonicity(node.children[1], node.splitZoom)
      }
    }
    checkMonotonicity(root!, -Infinity)
  })

  it('should produce splitZoom > 22 for two tours at identical coordinates', () => {
    const root = buildClusterTree([makeTour('a', 8.0, 47.0), makeTour('b', 8.0, 47.0)])
    expect(root!.kind).toBe('internal')
    const node = root as import('@/features/map/presentation/components/cluster-tree').InternalNode
    expect(node.splitZoom).toBeGreaterThan(22)
  })
})

describe('cutForest', () => {
  it('should return root when zoom < root.splitZoom', () => {
    const root = buildClusterTree([makeTour('a', 8.0, 47.0), makeTour('b', 8.1, 47.0)])
    const node = root as import('@/features/map/presentation/components/cluster-tree').InternalNode
    const forest = cutForest(root, node.splitZoom - 1)
    expect(forest).toHaveLength(1)
    expect(forest[0]!.id).toBe(node.id)
  })

  it('should return all leaves when zoom >= max splitZoom', () => {
    const tours = [makeTour('a', 8.0, 47.0), makeTour('b', 8.1, 47.0), makeTour('c', 8.2, 47.0)]
    const root = buildClusterTree(tours)
    const splitZooms = collectSplitZooms(root)
    const maxZoom = Math.max(...splitZooms)
    const forest = cutForest(root, maxZoom + 1)
    expect(forest.every(n => n.kind === 'leaf')).toBe(true)
    expect(forest.map(n => n.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('should filter nodes outside bbox', () => {
    const root = buildClusterTree([makeTour('a', 8.0, 47.0), makeTour('b', 9.5, 47.0)])
    // bbox covers only western region
    const bbox: [number, number, number, number] = [7, 46, 9, 48]
    const forest = cutForest(root, 100, bbox) // zoom 100 → all leaves
    expect(forest.every(n => n.kind === 'leaf')).toBe(true)
    expect(forest).toHaveLength(1)
    expect(forest[0]!.id).toBe('a')
  })
})

describe('findCrossings', () => {
  const zooms = [10, 12, 14, 16]

  it('should return crossings when zooming in', () => {
    expect(findCrossings(zooms, 9, 13)).toEqual([10, 12])
    expect(findCrossings(zooms, 9, 10)).toEqual([10])
    expect(findCrossings(zooms, 10, 12)).toEqual([12])
  })

  it('should return crossings when zooming out', () => {
    expect(findCrossings(zooms, 15, 11)).toEqual([12, 14])
    expect(findCrossings(zooms, 16, 14)).toEqual([14])
    expect(findCrossings(zooms, 12, 10)).toEqual([10])
  })

  it('should return empty when no crossings', () => {
    expect(findCrossings(zooms, 10.1, 11.9)).toEqual([])
    expect(findCrossings(zooms, 10, 10)).toEqual([])
  })

  it('should handle multi-crossing zoom', () => {
    expect(findCrossings(zooms, 9, 17)).toEqual([10, 12, 14, 16])
  })
})

describe('buildClusterTree nearest-neighbour cache', () => {
  /** The pre-cache O(n³) build: merge the globally closest pair, repeat. Returns merge signatures. */
  function bruteForceMerges(tours: Tour[]): string[] {
    const nodes = tours.map(t => ({ ids: [t.id], c: [t.goal.lng, t.goal.lat] as [number, number] }))
    const merges: string[] = []
    while (nodes.length > 1) {
      let best = [0, 1, Infinity]
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = haversineMeters(nodes[i]!.c, nodes[j]!.c)
          if (d < best[2]!)
            best = [i, j, d]
        }
      }
      const [a, b] = [nodes[best[0]!]!, nodes[best[1]!]!]
      const w = a.ids.length + b.ids.length
      const merged = {
        ids: [...a.ids, ...b.ids].sort(),
        c: [(a.c[0] * a.ids.length + b.c[0] * b.ids.length) / w, (a.c[1] * a.ids.length + b.c[1] * b.ids.length) / w] as [number, number],
      }
      merges.push(merged.ids.join())
      nodes.splice(best[1]!, 1)
      nodes.splice(best[0]!, 1)
      nodes.push(merged)
    }
    return merges
  }

  it('should merge in exactly the order of the exhaustive pair search', () => {
    let seed = 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const tours = Array.from({ length: 120 }, (_, i) => makeTour(`t${i}`, 6 + rand() * 4, 45.9 + rand() * 1.8))
    const merges: string[] = []
    const walk = (n: ReturnType<typeof buildClusterTree>): void => {
      if (n?.kind === 'internal') {
        merges.push(n.leafIds.join())
        n.children.forEach(walk)
      }
    }
    walk(buildClusterTree(tours))
    expect(merges.sort()).toEqual(bruteForceMerges(tours).sort())
  })
})

describe('buildClusterTree cluster ids', () => {
  function clusterIds(root: ReturnType<typeof buildClusterTree>): Map<string, string> {
    const ids = new Map<string, string>()
    const walk = (n: ReturnType<typeof buildClusterTree>): void => {
      if (n?.kind === 'internal') {
        ids.set(n.leafIds.join(), n.id)
        n.children.forEach(walk)
      }
    }
    walk(root)
    return ids
  }

  it('should keep the id of every cluster that does not contain a removed tour', () => {
    const tours = [
      makeTour('a', 8.0, 47.0),
      makeTour('b', 8.001, 47.0),
      makeTour('c', 9.0, 46.5),
      makeTour('d', 9.001, 46.5),
      makeTour('e', 9.002, 46.5),
    ]
    const before = clusterIds(buildClusterTree(tours))
    const after = clusterIds(buildClusterTree(tours.filter(t => t.id !== 'e')))
    expect(after.get('a,b')).toBe(before.get('a,b'))
    expect(after.get('c,d')).not.toBe(before.get('c,d,e'))
  })

  it('should give two stacks distinct ids when their tour ids differ only in the last character', () => {
    const id = (n: number) => `de300000-0000-4000-8000-00000000000${n}`
    const tours = [
      ...[1, 2, 3, 4].map(n => makeTour(id(n), 7.8948, 46.0464)),
      ...[5, 6, 7, 8].map(n => makeTour(id(n), 9.3433 + n / 1e5, 47.2494)),
    ]
    const ids = clusterIds(buildClusterTree(tours))
    expect(ids.get([1, 2, 3, 4].map(id).join())).not.toBe(ids.get([5, 6, 7, 8].map(id).join()))
  })
})
