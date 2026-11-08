import type { RenderedNode } from '@/features/map/presentation/components/cluster-transitions'
import { describe, expect, it } from 'vitest'
import { diffForests } from '@/features/map/presentation/components/cluster-transitions'
import { CLUSTER_RADIUS } from '@/features/map/presentation/components/tours-marker-layer'

function node(id: string, kind: 'leaf' | 'internal', centroid: [number, number], leafIds: string[]): RenderedNode {
  return { id, kind, centroid, leafIds }
}

describe('cluster config constants', () => {
  it('should export CLUSTER_RADIUS = 50', () => {
    expect(CLUSTER_RADIUS).toBe(50)
  })
})

describe('diffForests', () => {
  it('should return empty diff when old and new are identical', () => {
    const n1 = node('a', 'leaf', [8, 47], ['a'])
    const old = new Map([['a', n1]])
    const { appeared, disappeared, updated } = diffForests(old, [
      { kind: 'leaf', id: 'a', coord: [8, 47] },
    ])
    expect(appeared).toHaveLength(0)
    expect(disappeared).toHaveLength(0)
    expect(updated).toHaveLength(1)
  })

  it('should detect appeared nodes', () => {
    const old: Map<string, RenderedNode> = new Map()
    const { appeared } = diffForests(old, [
      { kind: 'leaf', id: 'a', coord: [8, 47] },
    ])
    expect(appeared).toHaveLength(1)
    expect(appeared[0]!.id).toBe('a')
  })

  it('should detect disappeared nodes', () => {
    const old = new Map([['a', node('a', 'leaf', [8, 47], ['a'])]])
    const { disappeared } = diffForests(old, [])
    expect(disappeared).toHaveLength(1)
    expect(disappeared[0]!.id).toBe('a')
  })

  it('should handle cluster split: parent disappeared, children appeared', () => {
    const parent = node('cluster-0', 'internal', [8, 47], ['a', 'b'])
    const old = new Map([['cluster-0', parent]])

    const newForest: import('@/features/map/presentation/components/cluster-tree').TreeNode[] = [
      { kind: 'leaf', id: 'a', coord: [7.9, 47.0] },
      { kind: 'leaf', id: 'b', coord: [8.1, 47.0] },
    ]

    const { appeared, disappeared, updated } = diffForests(old, newForest)
    expect(disappeared).toHaveLength(1)
    expect(disappeared[0]!.id).toBe('cluster-0')
    expect(appeared.map(n => n.id).sort()).toEqual(['a', 'b'])
    expect(updated).toHaveLength(0)
  })

  it('should handle merge: children disappeared, parent appeared', () => {
    const c1 = node('a', 'leaf', [7.9, 47], ['a'])
    const c2 = node('b', 'leaf', [8.1, 47], ['b'])
    const old = new Map([['a', c1], ['b', c2]])

    const newForest: import('@/features/map/presentation/components/cluster-tree').TreeNode[] = [
      {
        kind: 'internal',
        id: 'cluster-0',
        centroid: [8.0, 47.0],
        leafIds: ['a', 'b'],
        children: [
          { kind: 'leaf', id: 'a', coord: [7.9, 47] },
          { kind: 'leaf', id: 'b', coord: [8.1, 47] },
        ],
        splitZoom: 10,
        totalLeafCount: 2,
      },
    ]

    const { appeared, disappeared, updated } = diffForests(old, newForest)
    expect(appeared).toHaveLength(1)
    expect(appeared[0]!.id).toBe('cluster-0')
    expect(disappeared.map(n => n.id).sort()).toEqual(['a', 'b'])
    expect(updated).toHaveLength(0)
  })
})
