import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The region-store is IndexedDB-backed (not in happy-dom); mock it so we can
// assert whether a region record is written.
vi.mock('@/features/map/data/services/offline-region-store', () => ({
  putRegion: vi.fn(),
  getAllRegions: vi.fn(async () => []),
}))

const { putRegion } = await import('@/features/map/data/services/offline-region-store')
const { downloadRegion } = await import('@/features/map/data/services/offline-tile-service')

const REGION = {
  id: 'r1',
  label: 'test',
  bbox: [7.7, 45.9, 7.8, 46.0] as [number, number, number, number],
  minZoom: 0,
  maxZoom: 1,
}

const STYLE = JSON.stringify({
  sprite: [{ id: 'default', url: 'https://vectortiles.geo.admin.ch/sprite' }],
  glyphs: 'https://vectortiles.geo.admin.ch/fonts/{fontstack}/{range}.pbf',
})

let put: ReturnType<typeof vi.fn>
let del: ReturnType<typeof vi.fn>

function stubCache() {
  put = vi.fn(async () => {})
  del = vi.fn(async () => {})
  vi.stubGlobal('caches', {
    open: vi.fn(async () => ({ put, delete: del, match: vi.fn(), keys: vi.fn(async () => []) })),
    delete: vi.fn(async () => true),
  })
}

function stubStorage(quota: number) {
  vi.stubGlobal('navigator', {
    storage: {
      estimate: async () => ({ usage: 0, quota }),
      persist: async () => true,
      persisted: async () => true,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  stubCache()
})
afterEach(() => vi.unstubAllGlobals())

describe('downloadRegion — ski routes', () => {
  const SKI_REGION = { ...REGION, minZoom: 11, maxZoom: 11 }

  function stubFetch(manifest: Response) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.endsWith('ski-routes.json'))
        return manifest
      if (u.endsWith('style.json'))
        return new Response(STYLE, { status: 200 })
      return new Response(new ArrayBuffer(16), { status: 200 })
    }))
  }

  it('should still download the base map when the ski-route manifest is unreachable', async () => {
    stubStorage(1e12)
    stubFetch(new Response('', { status: 503 }))

    await downloadRegion(SKI_REGION)
    expect(putRegion).toHaveBeenCalledOnce()
    expect(put.mock.calls.some(([key]) => String(key).includes('/ski-routes/'))).toBe(false)
  })

  it('should store ski-route tiles under their version-less key', async () => {
    stubStorage(1e12)
    stubFetch(new Response(JSON.stringify({ tiles: ['https://tourenbuddy-data.pages.dev/ski-routes/v9/{z}/{x}/{y}.pbf'] })))

    await downloadRegion(SKI_REGION)
    const skiKeys = put.mock.calls.map(([key]) => String(key)).filter(k => k.includes('/ski-routes/'))
    expect(skiKeys.length).toBeGreaterThan(0)
    expect(skiKeys.every(k => /\/ski-routes\/11\/\d+\/\d+\.pbf$/.test(k))).toBe(true)
  })
})

describe('downloadRegion — failure paths', () => {
  it('aborts before any write when the estimate exceeds quota headroom, leaving no record', async () => {
    stubStorage(1_000_000) // headroom ~900 KB < ~3 MB asset allowance
    vi.stubGlobal('fetch', vi.fn(async () => new Response(STYLE, { status: 200 })))

    await expect(downloadRegion(REGION)).rejects.toThrow()
    expect(put).not.toHaveBeenCalled()
    expect(putRegion).not.toHaveBeenCalled()
  })

  it('rolls back cache writes and writes no record when a tile fetch fails hard', async () => {
    stubStorage(1e12) // plenty of headroom → passes the pre-check
    // Assets succeed; every tile 403s (non-transient → fails the whole download).
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/tiles/'))
        return new Response('nope', { status: 403 })
      if (u.endsWith('style.json'))
        return new Response(STYLE, { status: 200 })
      return new Response(new ArrayBuffer(16), { status: 200 })
    }))

    await expect(downloadRegion(REGION)).rejects.toThrow()
    expect(putRegion).not.toHaveBeenCalled() // no partial region
    expect(del).toHaveBeenCalled() // written assets rolled back
  })
})
