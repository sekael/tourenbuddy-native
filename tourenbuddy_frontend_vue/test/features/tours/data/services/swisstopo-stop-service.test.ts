import { afterEach, describe, expect, it, vi } from 'vitest'
import { findStopsNear } from '@/features/tours/data/services/swisstopo-stop-service'

const GOAL = { lng: 8.4551, lat: 46.6989 }
const feature = (name: string | null, coordinates: unknown) => ({ geometry: { coordinates }, properties: { name } })

function respond(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

describe('findStopsNear', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('should list named stops within 8 km nearest first, once per name', async () => {
    respond({ results: [
      feature('Susten Passhöhe', [[8.4466, 46.7291]]),
      feature('Steingletscher, Susten', [8.4275, 46.7311]),
      feature('Susten Passhöhe', [[8.4465, 46.7290]]),
      feature(null, [[8.45, 46.70]]),
      feature('Göschenen', [[8.59, 46.67]]),
      feature('Wassen', [[8.60, 46.70]]),
      feature('broken', []),
    ] })
    const stops = await findStopsNear(GOAL, new AbortController().signal)
    expect(stops.map(s => s.name)).toEqual(['Susten Passhöhe', 'Steingletscher, Susten'])
    expect(stops[0]!.distance).toBeLessThan(stops[1]!.distance)
  })

  it('should reject a failed lookup', async () => {
    respond({}, 500)
    await expect(findStopsNear(GOAL, new AbortController().signal)).rejects.toThrow('HTTP 500')
  })
})
