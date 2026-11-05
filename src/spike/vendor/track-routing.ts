import type { LngLat } from './trail'

/**
 * A planar point in network units: global pixels of zoom-13 vector tiles 4096 units wide (Web
 * Mercator). Tile vertices land on whole units, so one vertex read from two neighbouring tiles is
 * the same point exactly. One unit is ~0.8 m in Switzerland.
 */
export type Pt = readonly [number, number]

export const WORLD_UNITS = 2 ** 25
const EARTH_CIRCUMFERENCE_M = 40075016.686

export function toUnits([lng, lat]: LngLat): Pt {
  const s = Math.sin(lat * Math.PI / 180)
  return [(lng + 180) / 360 * WORLD_UNITS, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD_UNITS]
}

export function toLngLat([x, y]: Pt): LngLat {
  const n = Math.PI - 2 * Math.PI * y / WORLD_UNITS
  return [x / WORLD_UNITS * 360 - 180, 180 / Math.PI * Math.atan(Math.sinh(n))]
}

/** Metres per network unit at `lat`. */
export function metersPerUnit(lat: number): number {
  return EARTH_CIRCUMFERENCE_M / WORLD_UNITS * Math.cos(lat * Math.PI / 180)
}

/** A way of the network, as drawn in the tiles. */
export interface NetworkLine {
  points: Pt[]
  /** Cost per unit of length: 1 on the network the user snaps to, more on ways it only falls back on. */
  cost: number
  /** How far this line's vertices reach to meet another line, when not the network's `join`. */
  join?: number
}

interface Edge { to: number, w: number }
interface Segment { a: number, b: number, cost: number }

export interface Network {
  nodes: Pt[]
  edges: Edge[][]
  segments: Segment[]
  grid: Map<string, number[]>
}

/** Where a point lands on the network, and how far that is from where it was set. */
export interface Snap {
  point: Pt
  segment: number
  distance: number
}

const CELL = 64

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
const cellKey = (cx: number, cy: number) => `${cx},${cy}`

function gridOf(segments: readonly Segment[], nodes: readonly Pt[]): Map<string, number[]> {
  const grid = new Map<string, number[]>()
  segments.forEach(({ a, b }, i) => {
    const [ax, ay] = nodes[a]!
    const [bx, by] = nodes[b]!
    for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++) {
      for (let cy = Math.floor(Math.min(ay, by) / CELL); cy <= Math.floor(Math.max(ay, by) / CELL); cy++) {
        const key = cellKey(cx, cy)
        const cell = grid.get(key)
        if (cell)
          cell.push(i)
        else
          grid.set(key, [i])
      }
    }
  })
  return grid
}

interface Hit { segment: number, t: number, point: Pt, distance: number }

/** Every segment within `radius` of `p` that `accept` allows, with its closest point, nearest first. */
function within(
  segments: readonly Segment[],
  nodes: readonly Pt[],
  grid: Map<string, number[]>,
  p: Pt,
  radius: number,
  accept: (i: number) => boolean = () => true,
): Hit[] {
  const hits: Hit[] = []
  const seen = new Set<number>()
  for (let cx = Math.floor((p[0] - radius) / CELL); cx <= Math.floor((p[0] + radius) / CELL); cx++) {
    for (let cy = Math.floor((p[1] - radius) / CELL); cy <= Math.floor((p[1] + radius) / CELL); cy++) {
      for (const i of grid.get(cellKey(cx, cy)) ?? []) {
        if (seen.has(i) || !accept(i))
          continue
        seen.add(i)
        const [ax, ay] = nodes[segments[i]!.a]!
        const [bx, by] = nodes[segments[i]!.b]!
        const dx = bx - ax
        const dy = by - ay
        const dd = dx * dx + dy * dy
        const t = dd === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / dd))
        const point: Pt = [ax + t * dx, ay + t * dy]
        const distance = dist(p, point)
        if (distance <= radius)
          hits.push({ segment: i, t, point, distance })
      }
    }
  }
  return hits.sort((a, b) => a.distance - b.distance)
}

/** How much a unit off the ways (tap to landing, across a gap in the tiles) weighs against one on them. */
const OFF_WAY_WEIGHT = 3

/**
 * The routable graph of `lines`. Lines sharing a vertex meet there. A vertex within `join` (its
 * line's own, if set) of another line also meets it, at its closest point: a path ending on a way
 * it was not split at (simplified tiles), a line cut at a tile edge and its continuation in the
 * next tile, and ski routes running side by side up a shared approach all become one network. A loose line end (no
 * other line meets it) reaches across to a way within `bridge`, at `OFF_WAY_WEIGHT`: the tiles
 * leave such gaps where people walk on, a street ending at the square a trail crosses.
 */
export function buildNetwork(lines: readonly NetworkLine[], join: number, bridge = join): Network {
  const nodes: Pt[] = []
  const ids = new Map<string, number>()
  const nodeAt = (p: Pt) => {
    const key = `${p[0]},${p[1]}`
    let id = ids.get(key)
    if (id === undefined) {
      id = nodes.push(p) - 1
      ids.set(key, id)
    }
    return id
  }

  const raw: (Segment & { line: number })[] = []
  const vertices: { node: number, line: number, end: boolean }[] = []
  const linesAt = new Map<number, Set<number>>()
  lines.forEach((line, li) => {
    let prev = -1
    line.points.forEach((p, k) => {
      const id = nodeAt(p)
      vertices.push({ node: id, line: li, end: k === 0 || k === line.points.length - 1 })
      linesAt.set(id, (linesAt.get(id) ?? new Set()).add(li))
      if (prev >= 0 && prev !== id)
        raw.push({ a: prev, b: id, cost: line.cost, line: li })
      prev = id
    })
  })

  // Joins: cut the other line at the closest point, or meet its end vertex.
  const rawGrid = gridOf(raw, nodes)
  const cuts = new Map<number, { t: number, from: number, weight: number }[]>()
  const links: [number, number, number][] = []
  for (const { node, line, end } of vertices) {
    const other = (i: number) => raw[i]!.line !== line && raw[i]!.a !== node && raw[i]!.b !== node
    let [hit] = within(raw, nodes, rawGrid, nodes[node]!, lines[line]!.join ?? join, other)
    let weight = 1
    if (!hit && end && linesAt.get(node)!.size === 1) {
      [hit] = within(raw, nodes, rawGrid, nodes[node]!, bridge, other)
      weight = OFF_WAY_WEIGHT
    }
    if (!hit)
      continue
    if (hit.t === 0 || hit.t === 1)
      links.push([node, hit.t === 0 ? raw[hit.segment]!.a : raw[hit.segment]!.b, weight])
    else
      cuts.set(hit.segment, [...(cuts.get(hit.segment) ?? []), { t: hit.t, from: node, weight }])
  }

  const segments: Segment[] = []
  raw.forEach(({ a, b, cost }, i) => {
    const [ax, ay] = nodes[a]!
    const [bx, by] = nodes[b]!
    const inner = (cuts.get(i) ?? []).sort((x, y) => x.t - y.t).map(({ t, from, weight }) => {
      const id = nodeAt([ax + t * (bx - ax), ay + t * (by - ay)])
      links.push([from, id, weight])
      return id
    })
    const chain = [a, ...inner, b]
    for (let k = 1; k < chain.length; k++) {
      if (chain[k - 1] !== chain[k])
        segments.push({ a: chain[k - 1]!, b: chain[k]!, cost })
    }
  })

  const edges: Edge[][] = nodes.map(() => [])
  const connect = (a: number, b: number, cost: number) => {
    const w = dist(nodes[a]!, nodes[b]!) * cost
    edges[a]!.push({ to: b, w })
    edges[b]!.push({ to: a, w })
  }
  for (const { a, b, cost } of segments)
    connect(a, b, cost)
  for (const [a, b, weight] of links)
    connect(a, b, weight)

  return { nodes, edges, segments, grid: gridOf(segments, nodes) }
}

/** Where `p` may land: every way within `radius`, nearest first. */
export function snapsAround(net: Network, p: Pt, radius: number): Snap[] {
  return within(net.segments, net.nodes, net.grid, p, radius).map(({ point, segment, distance }) => ({ point, segment, distance }))
}

/** The closest point of the network within `radius` of `p`; null off the network. */
export function snapTo(net: Network, p: Pt, radius: number): Snap | null {
  return snapsAround(net, p, radius)[0] ?? null
}

/**
 * The cheapest way along the network from one snap to another (A*), as points from `from.point`
 * to `to.point`, with its cost. Null when the network does not connect them.
 */
export function routeBetween(net: Network, from: Snap, to: Snap): { points: Pt[], cost: number } | null {
  if (from.segment === to.segment)
    return { points: [from.point, to.point], cost: dist(from.point, to.point) * net.segments[from.segment]!.cost }
  const { nodes, edges } = net
  const start = nodes.length
  const goal = start + 1
  const at = (i: number) => (i === start ? from.point : i === goal ? to.point : nodes[i]!)
  // The snaps join the graph through their segment's two ends.
  const ends = (s: Snap): Edge[] => {
    const { a, b, cost } = net.segments[s.segment]!
    return [a, b].map(n => ({ to: n, w: dist(s.point, nodes[n]!) * cost }))
  }
  const toGoal = new Map(ends(to).map(({ to: n, w }) => [n, w]))
  const neighbours = (i: number): Edge[] => {
    if (i === start)
      return ends(from)
    const out = edges[i]!
    const w = toGoal.get(i)
    return w === undefined ? out : [...out, { to: goal, w }]
  }

  const cost = new Float64Array(nodes.length + 2).fill(Infinity)
  const prev = new Int32Array(nodes.length + 2).fill(-1)
  const heap = new MinHeap()
  cost[start] = 0
  heap.push(start, dist(from.point, to.point))
  while (heap.size > 0) {
    const i = heap.pop()
    if (i === goal)
      break
    for (const { to: j, w } of neighbours(i)) {
      const c = cost[i]! + w
      if (c < cost[j]!) {
        cost[j] = c
        prev[j] = i
        heap.push(j, c + dist(at(j), to.point))
      }
    }
  }
  if (prev[goal] === -1)
    return null
  const path: Pt[] = []
  for (let i = goal; i !== -1; i = prev[i]!) {
    // A snap right on a node would repeat its point.
    const p = at(i)
    if (path.length === 0 || dist(path.at(-1)!, p) > 0)
      path.push(p)
  }
  return { points: path.reverse(), cost: cost[goal]! }
}

/**
 * The way from `from` to a tap at `p`. Of the ways the tap is about as near to as the nearest
 * (within `slack`), it lands on the one that costs least to reach, each unit off the tap
 * counting `OFF_WAY_WEIGHT` times: a tap beside a road and a side path running along it lands on
 * the road the route came by, not on the path, which it would reach only at its far end and come
 * back from.
 * One Dijkstra from `from` scores every candidate; null when none is reachable.
 */
export function routeToTap(net: Network, from: Snap, p: Pt, radius: number, slack: number): { to: Snap, points: Pt[] } | null {
  const all = snapsAround(net, p, radius)
  const candidates = all.filter(c => c.distance <= all[0]!.distance + slack)
  if (candidates.length === 0)
    return null
  const { nodes, edges, segments } = net
  const start = nodes.length
  // Where each candidate joins the graph: its segment's two ends.
  const arrivals = new Map<number, { to: Snap, w: number }[]>()
  let best: { to: Snap, via: number, score: number } | null = null
  for (const to of candidates) {
    const { a, b, cost } = segments[to.segment]!
    const offTap = to.distance * OFF_WAY_WEIGHT
    if (to.segment === from.segment) {
      const score = dist(from.point, to.point) * cost + offTap
      if (!best || score < best.score)
        best = { to, via: start, score }
    }
    for (const n of [a, b])
      arrivals.set(n, [...(arrivals.get(n) ?? []), { to, w: dist(nodes[n]!, to.point) * cost + offTap }])
  }

  const cost = new Float64Array(nodes.length + 1).fill(Infinity)
  const prev = new Int32Array(nodes.length + 1).fill(-1)
  const done = new Uint8Array(nodes.length + 1)
  const heap = new MinHeap()
  cost[start] = 0
  heap.push(start, 0)
  const { a: fa, b: fb, cost: fc } = segments[from.segment]!
  while (heap.size > 0) {
    const i = heap.pop()
    if (done[i])
      continue
    done[i] = 1
    // Nothing reached later can beat the best: every way on costs more.
    if (best && cost[i]! >= best.score)
      break
    for (const { to, w } of arrivals.get(i) ?? []) {
      if (!best || cost[i]! + w < best.score)
        best = { to, via: i, score: cost[i]! + w }
    }
    const out = i === start ? [fa, fb].map(n => ({ to: n, w: dist(from.point, nodes[n]!) * fc })) : edges[i]!
    for (const { to: j, w } of out) {
      if (cost[i]! + w < cost[j]!) {
        cost[j] = cost[i]! + w
        prev[j] = i
        heap.push(j, cost[j]!)
      }
    }
  }
  if (!best)
    return null
  const points: Pt[] = [best.to.point]
  for (let i = best.via; i !== -1; i = prev[i]!) {
    const q = i === start ? from.point : nodes[i]!
    if (dist(points.at(-1)!, q) > 0)
      points.push(q)
  }
  return { to: best.to, points: points.reverse() }
}

/** Binary min-heap of node ids by priority; stale entries are skipped by the caller's cost check. */
class MinHeap {
  private ids: number[] = []
  private keys: number[] = []

  get size() {
    return this.ids.length
  }

  push(id: number, key: number) {
    let i = this.ids.length
    this.ids.push(id)
    this.keys.push(key)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent]! <= key)
        break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): number {
    const top = this.ids[0]!
    const lastId = this.ids.pop()!
    const lastKey = this.keys.pop()!
    if (this.ids.length > 0) {
      this.ids[0] = lastId
      this.keys[0] = lastKey
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.keys.length && this.keys[l]! < this.keys[m]!)
          m = l
        if (r < this.keys.length && this.keys[r]! < this.keys[m]!)
          m = r
        if (m === i)
          break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }

  private swap(a: number, b: number) {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!]
  }
}
