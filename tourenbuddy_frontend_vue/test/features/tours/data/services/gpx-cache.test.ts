import { describe, expect, it } from 'vitest'
import { createGpxCache } from '@/features/tours/data/services/gpx-cache'

function mockGeojson(id: string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { id } },
    ],
  }
}

describe('useGpxCache', () => {
  it('should miss on a new key', () => {
    const { get, has } = createGpxCache()
    expect(has('unknown')).toBe(false)
    expect(get('unknown')).toBeUndefined()
  })

  it('should hit after set', () => {
    const { get, set, has } = createGpxCache()
    const data = mockGeojson('a')
    set('tour-a', data)
    expect(has('tour-a')).toBe(true)
    expect(get('tour-a')).toBe(data)
  })

  it('should evict oldest entry when cap (10) is exceeded', () => {
    const { set, has } = createGpxCache()
    for (let i = 0; i < 10; i++) {
      set(`tour-${i}`, mockGeojson(`${i}`))
    }
    expect(has('tour-0')).toBe(true)

    set('tour-10', mockGeojson('10'))
    expect(has('tour-0')).toBe(false)
    expect(has('tour-10')).toBe(true)
  })

  it('should update existing entry without growing beyond cap', () => {
    const { get, set, has } = createGpxCache()
    for (let i = 0; i < 10; i++) {
      set(`tour-${i}`, mockGeojson(`${i}`))
    }
    const updated = mockGeojson('updated')
    set('tour-0', updated)
    set('tour-10', mockGeojson('10'))

    expect(has('tour-0')).toBe(true)
    expect(get('tour-0')).toBe(updated)
    expect(has('tour-1')).toBe(false)
  })
})
