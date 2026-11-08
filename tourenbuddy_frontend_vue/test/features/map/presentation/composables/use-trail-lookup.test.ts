import type { Map as MapLibreMap, Point } from 'maplibre-gl'
import type { Trail } from '@/features/map/domain/entities/trail'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSkiRoute, SkiRouteNotFoundError } from '@/features/map/data/services/swisstopo-trail-service'
import { routeFileUrl, useTrailLookup } from '@/features/map/presentation/composables/use-trail-lookup'

vi.mock('@/features/map/data/services/swisstopo-trail-service', () => ({
  fetchSkiRoute: vi.fn(),
  SkiRouteNotFoundError: class extends Error {},
}))

const OLD = 'https://data.test/ski-routes/v1/{z}/{x}/{y}.pbf'
const NEW = 'https://data.test/ski-routes/v2/{z}/{x}/{y}.pbf'

// Screen px = lng/lat as-is, so a piece at x = n lies n px right of a tap at the origin.
const piece = (id: string, x: number) => ({ properties: { id }, geometry: { type: 'LineString', coordinates: [[x, -1], [x, 1]] } })
let pieces: ReturnType<typeof piece>[] = []
const setUrl = vi.fn()
const map = {
  getLayer: () => ({}),
  getSource: () => ({ tiles: [OLD], setUrl }),
  queryRenderedFeatures: () => pieces,
  project: ([x, y]: [number, number]) => ({ x, y }),
} as unknown as MapLibreMap
const TAP = { x: 0, y: 0 } as Point
const trail = (id: string): Trail => ({ overlay: 'ski', id, lines: [[[0, 0], [1, 1]]], route: null })
const notFound = () => Promise.reject(new SkiRouteNotFoundError('404'))
const manifest = vi.fn()

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useTrailLookup', () => {
  const onError = vi.fn()
  const create = () => useTrailLookup({ map: () => map, locale: () => 'en', onError })

  beforeEach(() => {
    pieces = [piece('r1', 2)]
    vi.mocked(fetchSkiRoute).mockReset().mockImplementation(async ({ url }) => trail(url.match(/routes\/(\w+)\.json$/)![1]!))
    onError.mockReset()
    setUrl.mockReset()
    manifest.mockReset().mockResolvedValue(new Response(JSON.stringify({ tiles: [NEW] })))
    vi.stubGlobal('fetch', manifest)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('should derive the route file from the tile template of the same version', () => {
    expect(routeFileUrl(OLD, '1020')).toBe('https://data.test/ski-routes/v1/routes/1020.json')
  })

  it('should list a route split across tiles once, ranked by its nearest piece', () => {
    pieces = [piece('a', 9), piece('b', 5), piece('a', 3)]
    expect(create().hitTest(TAP).ids).toEqual(['a', 'b'])
  })

  it('should ignore pieces beyond the tap tolerance', () => {
    pieces = [piece('near', 5), piece('far', 40)]
    expect(create().hitTest(TAP).ids).toEqual(['near'])
  })

  it('should cap at eight nearest routes and count the rest', () => {
    pieces = [10, 3, 7, 1, 9, 11, 2, 5, 12, 4, 8, 6].map(x => piece(`r${x}`, x / 2))
    const hits = create().hitTest(TAP)
    expect(hits.ids).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'])
    expect(hits.more).toBe(4)
  })

  it('should miss without any request when no route is under the tap', async () => {
    pieces = []
    expect(await create().lookup(TAP)).toEqual({ candidates: [], more: 0 })
    expect(fetchSkiRoute).not.toHaveBeenCalled()
  })

  it('should report a failed load and open nothing', async () => {
    vi.mocked(fetchSkiRoute).mockRejectedValue(new Error('HTTP 500'))
    expect(await create().lookup(TAP)).toBeNull()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('should never apply a tap superseded by a newer one', async () => {
    const first = deferred<Trail>()
    vi.mocked(fetchSkiRoute).mockReturnValueOnce(first.promise)
    const lookup = create()

    const older = lookup.lookup(TAP)
    pieces = [piece('r2', 2)]
    const newer = await lookup.lookup(TAP)
    first.resolve(trail('r1'))

    expect(await older).toBeNull()
    expect(newer?.candidates.map(c => c.id)).toEqual(['r2'])
    expect(onError).not.toHaveBeenCalled()
  })

  it('should reload the manifest after a dataset refresh and load the route from the new version', async () => {
    vi.mocked(fetchSkiRoute).mockImplementationOnce(notFound)
    const hits = await create().lookup(TAP)

    expect(hits?.candidates.map(c => c.id)).toEqual(['r1'])
    expect(vi.mocked(fetchSkiRoute).mock.calls[1]![0].url).toBe('https://data.test/ski-routes/v2/routes/r1.json')
    expect(setUrl).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('should silently drop a route removed in the new version', async () => {
    vi.mocked(fetchSkiRoute).mockImplementation(notFound)
    expect(await create().lookup(TAP)).toEqual({ candidates: [], more: 0 })
    expect(onError).not.toHaveBeenCalled()
  })

  it('should reload the manifest at most once per throttle window', async () => {
    vi.mocked(fetchSkiRoute).mockImplementation(notFound)
    const lookup = create()
    await lookup.lookup(TAP)
    await lookup.lookup(TAP)
    expect(manifest).toHaveBeenCalledOnce()
  })

  it('should share one manifest reload between routes of the same tap', async () => {
    pieces = [piece('a', 1), piece('b', 2), piece('c', 3)]
    vi.mocked(fetchSkiRoute).mockImplementation(notFound)
    await create().lookup(TAP)
    expect(manifest).toHaveBeenCalledOnce()
  })

  it('should not reload the manifest for an empty (404) tile', () => {
    create().onMapError({ sourceId: 'trail-clickable', error: { status: 404 } } as never)
    expect(manifest).not.toHaveBeenCalled()
  })

  it('should reload the manifest when a ski tile fails without HTTP status', () => {
    create().onMapError({ sourceId: 'trail-clickable', error: {} } as never)
    expect(manifest).toHaveBeenCalledOnce()
  })
})
