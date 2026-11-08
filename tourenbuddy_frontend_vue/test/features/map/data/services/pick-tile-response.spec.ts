import { describe, expect, it, vi } from 'vitest'
import { pickTileResponse } from '@/features/map/data/services/pick-tile-response'

const req = new Request('https://vectortiles3.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/8/133/90.pbf')

describe('pickTileResponse', () => {
  it('returns the offline copy and does NOT call the SWR handler on a cache hit', async () => {
    const cached = new Response('offline')
    const swrHandler = vi.fn(async () => new Response('network'))
    const res = await pickTileResponse(req, {
      cacheMatch: async () => cached,
      swrHandler,
    })
    expect(await res.text()).toBe('offline')
    expect(swrHandler).not.toHaveBeenCalled()
  })

  it('normalizes the sharded host before the cache lookup', async () => {
    const cacheMatch = vi.fn(async () => undefined)
    await pickTileResponse(req, { cacheMatch, swrHandler: async () => new Response('network') })
    expect(cacheMatch).toHaveBeenCalledWith(
      'https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/8/133/90.pbf',
    )
  })

  it('looks up a ski-route tile under its version-less key, so a region downloaded before a dataset refresh still answers', async () => {
    const cacheMatch = vi.fn(async () => undefined)
    const ski = new Request('https://tourenbuddy-data.pages.dev/ski-routes/2026-12-14T080000/13/4285/2884.pbf')
    await pickTileResponse(ski, { cacheMatch, swrHandler: async () => new Response('network') })
    expect(cacheMatch).toHaveBeenCalledWith('https://tourenbuddy-data.pages.dev/ski-routes/13/4285/2884.pbf')
  })

  it('delegates to the SWR handler on a cache miss', async () => {
    const res = await pickTileResponse(req, {
      cacheMatch: async () => undefined,
      swrHandler: async () => new Response('network'),
    })
    expect(await res.text()).toBe('network')
  })

  it('falls back to the SWR handler when the cache read throws (never rejects)', async () => {
    const res = await pickTileResponse(req, {
      cacheMatch: async () => {
        throw new Error('cache unreadable')
      },
      swrHandler: async () => new Response('network'),
    })
    expect(await res.text()).toBe('network')
  })
})
