import type { LocationResult } from '@/features/map/data/services/swisstopo-search-service'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseLabel, rankResults, searchLocations } from '@/features/map/data/services/swisstopo-search-service'

function result(name: string, lng: number, lat = 46.5, objectclass: string | null = null): LocationResult {
  return { name, kind: null, region: null, origin: 'gazetteer', objectclass, lng, lat, zoom: 14 }
}

function respond(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
}

describe('parseLabel', () => {
  it('should decode entities and drop markup instead of rendering it', () => {
    const parts = parseLabel('<i>Gebaeude</i> <b>Hotel &amp; <img src=x onerror=alert(1)>Spa</b> (GR) - Pontresina')
    expect(parts).toEqual({ name: 'Hotel & Spa', kind: 'Gebaeude', region: 'Pontresina (GR)' })
  })

  it('should keep the street of an address and drop the stray hash', () => {
    expect(parseLabel('Via Pros da God # <b>7504 Pontresina</b>')).toEqual({
      name: 'Via Pros da God, 7504 Pontresina',
      kind: null,
      region: null,
    })
  })

  it('should fall back to the whole text when a label has no bold part', () => {
    expect(parseLabel('Pontresina').name).toBe('Pontresina')
  })
})

describe('searchLocations', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('should drop malformed entries without failing the whole search', async () => {
    respond({ results: [
      { attrs: { label: '<b>Piz Ela</b>', lat: 46.6, lon: 9.7, origin: 'gazetteer' } },
      { attrs: { label: '<b>No coords</b>', origin: 'gazetteer' } },
      { attrs: { label: '<b></b>', lat: 46.6, lon: 9.7, origin: 'gazetteer' } },
    ] })
    const results = await searchLocations('Piz', 'de-CH', new AbortController().signal)
    expect(results.map(r => r.name)).toEqual(['Piz Ela'])
  })

  it('should restore umlauts in German kinds only, keeping real "ue" and names as given', async () => {
    const kinds = ['Gebaeude', 'Uebrige Bahnen', 'Oeffentliches Parkareal', 'Quelle', 'Feuerstelle']
    const body = { results: kinds.map(k => ({ attrs: { label: `<i>${k}</i> <b>Uetliberg</b>`, lat: 46.6, lon: 9.7, origin: 'gazetteer' } })) }
    respond(body)
    const de = await searchLocations('x', 'de-CH', new AbortController().signal)
    expect(de.map(r => r.kind)).toEqual(['Gebäude', 'Übrige Bahnen', 'Öffentliches Parkareal', 'Quelle', 'Feuerstelle'])
    expect(de[0]!.name).toBe('Uetliberg')
    respond(body)
    const en = await searchLocations('x', 'en', new AbortController().signal)
    expect(en.map(r => r.kind)).toEqual(kinds)
  })

  it('should use the default zoom for an unknown origin', async () => {
    respond({ results: [{ attrs: { label: '<b>Somewhere</b>', lat: 46.6, lon: 9.7, origin: 'parcel' } }] })
    const [r] = await searchLocations('Some', 'en', new AbortController().signal)
    expect(r!.zoom).toBe(13)
  })

  it('should reject a non-OK response', async () => {
    respond({}, 500)
    await expect(searchLocations('Piz', 'de', new AbortController().signal)).rejects.toThrow('500')
  })

  it('should reject a response without a results list', async () => {
    respond({ error: 'nope' })
    await expect(searchLocations('Piz', 'de', new AbortController().signal)).rejects.toThrow()
  })

  it('should reject with AbortError, not TimeoutError, when the caller aborts', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const controller = new AbortController()
    const pending = searchLocations('Piz', 'de', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('should reject with TimeoutError when the service does not answer in time', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const pending = searchLocations('Piz', 'de', new AbortController().signal)
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })
})

describe('rankResults', () => {
  const center = { lng: 7.6, lat: 46.4 }

  it('should keep the service order when zoomed out below regional level', () => {
    const list = [result('Schwarzhorn', 9.9), result('Schwarzhorn', 7.6)]
    expect(rankResults(list, center, 8.9)).toEqual(list)
  })

  it('should list the nearest of identically named places first from zoom 9', () => {
    const far = result('Schwarzhorn', 9.9)
    const near = result('Schwarzhorn', 7.61)
    expect(rankResults([far, near], center, 9)).toEqual([near, far])
  })

  it('should never move results with other names, even when nearer', () => {
    const list = [result('Piz Bernina', 9.9), result('Bernina Pass', 7.6), result('Piz Bernina', 7.61)]
    expect(rankResults(list, center, 12).map(r => [r.name, r.lng])).toEqual([
      ['Piz Bernina', 7.61],
      ['Piz Bernina', 9.9],
      ['Bernina Pass', 7.6],
    ])
  })

  it('should surface a nearby duplicate that the service ranked beyond the shown list', () => {
    const fillers = Array.from({ length: 10 }, (_, i) => result(`Filler ${i}`, 8))
    const nearDuplicate = result('Schwarzhorn', 7.6)
    const list = [result('Schwarzhorn', 9.9), ...fillers, nearDuplicate]
    const ranked = rankResults(list, center, 10)
    expect(ranked).toHaveLength(8)
    expect(ranked[0]).toBe(nearDuplicate)
  })
})

describe('role-aware search (smarter-tour-creation D1)', () => {
  afterEach(() => vi.unstubAllGlobals())

  const place = (label: string, lon: number, objectclass: string) => ({ attrs: { label, lat: 46.73, lon, origin: 'gazetteer', objectclass } })
  const stop = (label: string, lon: number) => ({ attrs: { label, lat: 46.73, lon, origin: 'feature' } })
  /** The place search answers `places`; the stop search answers `stops` (or fails with it). */
  function respondBoth(places: unknown[], stops: unknown[] | Error) {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('featuresearch'))
        return stops instanceof Error ? Promise.reject(stops) : Promise.resolve(new Response(JSON.stringify({ results: stops })))
      return Promise.resolve(new Response(JSON.stringify({ results: places })))
    }))
  }

  it('should not look for stops when picking a goal', async () => {
    respondBoth([place('<b>Sustenhorn</b>', 8.45, 'TLM_NAME_PKT')], [stop('Steingletscher, Susten', 8.427)])
    const found = await searchLocations('Susten', 'de-CH', new AbortController().signal)
    expect(found.map(r => r.origin)).toEqual(['gazetteer'])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('should add stops for a start, dropping one at a same-named place', async () => {
    respondBoth(
      [place('<i>Übrige Bahnen</i> <b>Diavolezza</b>', 9.966, 'TLM_HALTESTELLE')],
      [stop('Diavolezza', 9.9661), stop('Diavolezza Talstation', 9.97)],
    )
    const found = await searchLocations('Diavolezza', 'de-CH', new AbortController().signal, 'start')
    expect(found.map(r => [r.name, r.origin])).toEqual([['Diavolezza', 'gazetteer'], ['Diavolezza Talstation', 'stop']])
  })

  it('should keep the place results when the stop search fails', async () => {
    respondBoth([place('<b>Steingletscher</b>', 8.43, 'TLM_SIEDLUNGSNAME')], new TypeError('offline'))
    const found = await searchLocations('Stein', 'de-CH', new AbortController().signal, 'end')
    expect(found.map(r => r.name)).toEqual(['Steingletscher'])
  })

  it('should rank the hamlet and the stop before the nearer glacier of the same name for a start', () => {
    const center = { lng: 8.455, lat: 46.699 }
    const glacier = result('Steingletscher', 8.45, 46.70, 'TLM_GELAENDENAME')
    const hamlet = result('Steingletscher', 8.43, 46.73, 'TLM_SIEDLUNGSNAME')
    const busStop = { ...result('Steingletscher, Susten', 8.427, 46.731), origin: 'stop' }
    const summit = result('Sustenhorn', 8.455, 46.699, 'TLM_NAME_PKT')
    const address = { ...result('Steingletscher 365c, 3863 Gadmen', 8.43, 46.73), origin: 'address' }
    expect(rankResults([address, glacier, summit, hamlet, busStop], center, 12, 'start').map(r => r.objectclass ?? r.origin))
      // House addresses after summits and passes; terrain last, even when it shares the hamlet's name.
      .toEqual(['stop', 'TLM_SIEDLUNGSNAME', 'TLM_NAME_PKT', 'address', 'TLM_GELAENDENAME'])
    // A goal keeps the service order with the nearest duplicate first.
    expect(rankResults([glacier, summit, hamlet], center, 12).map(r => r.objectclass))
      .toEqual(['TLM_GELAENDENAME', 'TLM_SIEDLUNGSNAME', 'TLM_NAME_PKT'])
  })
})
