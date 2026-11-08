import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service'

/** A fetch that only settles when its signal aborts — a Swisstopo that never answers. */
function hangingFetch() {
  vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
}

describe('getElevation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('should return elevation rounded to nearest meter on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ height: 2376.7 }), { status: 200 }),
    )

    const result = await getElevation({ lng: 8.0, lat: 46.5 })
    expect(result).toBe(2377)
  })

  it('should round down when fractional part is below 0.5', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ height: 2376.3 }), { status: 200 }),
    )

    const result = await getElevation({ lng: 8.0, lat: 46.5 })
    expect(result).toBe(2376)
  })

  it('should return elevation when height is a numeric string', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ height: '1850.0' }), { status: 200 }),
    )

    const result = await getElevation({ lng: 7.5, lat: 46.8 })
    expect(result).toBe(1850)
  })

  it('should return null when height is "None" (outside Switzerland)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ height: 'None' }), { status: 200 }),
    )

    const result = await getElevation({ lng: 2.3, lat: 48.8 })
    expect(result).toBeNull()
  })

  it('should return null on non-OK HTTP response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Server Error', { status: 500 }))

    const result = await getElevation({ lng: 8.0, lat: 46.5 })
    expect(result).toBeNull()
  })

  it('should return null on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'))

    const result = await getElevation({ lng: 8.0, lat: 46.5 })
    expect(result).toBeNull()
  })

  it('should return null on timeout (AbortError)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(Object.assign(new DOMException('Aborted', 'AbortError')))

    const result = await getElevation({ lng: 8.0, lat: 46.5 })
    expect(result).toBeNull()
  })

  it('should call the API with sr=2056 (LV95)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ height: 500 }), { status: 200 }),
    )

    await getElevation({ lng: 8.5402, lat: 47.3777 })

    expect(fetch).toHaveBeenCalledOnce()
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).toContain('sr=2056')
    expect(url).toContain('easting=')
    expect(url).toContain('northing=')
  })
  it('should abort the request and return null when the caller stops waiting', async () => {
    hangingFetch()
    const caller = new AbortController()
    const result = getElevation({ lng: 8.0, lat: 46.5 }, caller.signal)
    caller.abort()
    expect(await result).toBeNull()
  })

  it('should wait up to 10 seconds before giving up', async () => {
    vi.useFakeTimers()
    hangingFetch()
    let settled = false
    const result = getElevation({ lng: 8.0, lat: 46.5 }).finally(() => (settled = true))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await result).toBeNull()
  })
})
