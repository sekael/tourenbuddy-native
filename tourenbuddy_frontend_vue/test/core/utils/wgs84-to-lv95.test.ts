import { describe, expect, it } from 'vitest'
import { wgs84ToLv95 } from '@/core/utils/wgs84-to-lv95'

// Bern LV95 origin (Nullpunkt): exact WGS84 position where λ'=0 and φ'=0
// λ = 7°26'22.500" = 7.43958333...°E
// φ = 46°57'08.660" = 46.95240556°N
// At this exact point, the formula reduces to its constant terms:
// E = 2600072.37, N = 1200147.07
const BERN_ORIGIN_LNG = 26782.5 / 3600 // = 7.439583...
const BERN_ORIGIN_LAT = 169028.66 / 3600 // = 46.952406...

describe('wgs84ToLv95', () => {
  it('should return constant-term values at the Bern LV95 origin (λ′=0, φ′=0)', () => {
    const { easting, northing } = wgs84ToLv95(BERN_ORIGIN_LNG, BERN_ORIGIN_LAT)
    // At origin auxiliary values are exactly 0, so only constant terms remain
    expect(easting).toBeCloseTo(2600072.37, 1)
    expect(northing).toBeCloseTo(1200147.07, 1)
  })

  it('should place Zurich east and north of Geneva', () => {
    const zurich = wgs84ToLv95(8.5402, 47.3777) // 47°N, 8.5°E
    const geneva = wgs84ToLv95(6.1432, 46.2047) // 46°N, 6.1°E
    expect(zurich.easting).toBeGreaterThan(geneva.easting)
    expect(zurich.northing).toBeGreaterThan(geneva.northing)
  })

  it('should place Zurich east and north of Bern', () => {
    const zurich = wgs84ToLv95(8.5402, 47.3777)
    const bern = wgs84ToLv95(7.4449, 46.9481)
    expect(zurich.easting).toBeGreaterThan(bern.easting)
    expect(zurich.northing).toBeGreaterThan(bern.northing)
  })

  it('should produce easting in the Swiss LV95 range for Swiss territory', () => {
    // Swiss LV95 easting range: roughly 2,480,000 – 2,840,000
    const points = [
      { lng: 8.5402, lat: 47.3777 }, // Zurich
      { lng: 7.4449, lat: 46.9481 }, // Bern
      { lng: 6.1432, lat: 46.2047 }, // Geneva
      { lng: 10.0, lat: 46.9 }, // Eastern Switzerland
    ]
    for (const p of points) {
      const { easting } = wgs84ToLv95(p.lng, p.lat)
      expect(easting).toBeGreaterThan(2_480_000)
      expect(easting).toBeLessThan(2_840_000)
    }
  })

  it('should produce northing in the Swiss LV95 range for Swiss territory', () => {
    // Swiss LV95 northing range: roughly 1,070,000 – 1,300,000
    const points = [
      { lng: 8.5402, lat: 47.3777 }, // Zurich
      { lng: 7.4449, lat: 46.9481 }, // Bern
      { lng: 6.1432, lat: 46.2047 }, // Geneva
    ]
    for (const p of points) {
      const { northing } = wgs84ToLv95(p.lng, p.lat)
      expect(northing).toBeGreaterThan(1_070_000)
      expect(northing).toBeLessThan(1_300_000)
    }
  })

  it('should return numeric values for coordinates outside Switzerland without throwing', () => {
    // Paris, France — outside Swiss bounds; function should not throw
    const result = wgs84ToLv95(2.3488, 48.8534)
    expect(typeof result.easting).toBe('number')
    expect(typeof result.northing).toBe('number')
    expect(Number.isFinite(result.easting)).toBe(true)
    expect(Number.isFinite(result.northing)).toBe(true)
  })
})
