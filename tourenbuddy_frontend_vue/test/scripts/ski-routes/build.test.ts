import { describe, expect, it } from 'vitest'
import { checkRoutes, checkTiles, MAX_TILE_BYTES, pagesRedirects } from '../../../scripts/ski-routes/build'

const tiles = (bytes = 1000) => [11, 12, 13].map(zoom => ({ zoom, bytes }))

describe('ski-route build gates', () => {
  it('should reject a route without sacid', () => {
    expect(() => checkRoutes([1, null], 2, null)).toThrow('without sacid')
  })

  it('should reject duplicate sacids', () => {
    expect(() => checkRoutes([1, '1'], 2, null)).toThrow('Duplicate sacid 1')
  })

  it('should reject an empty release', () => {
    expect(() => checkRoutes([], 0, null)).toThrow('No routes')
  })

  it('should report a count drift beyond 30% as skippable, not throw', () => {
    expect(checkRoutes([1, 2], 2, { version: 'v1', count: 100 })).toMatch('drifts')
  })

  it('should accept a drift within 30%', () => {
    expect(checkRoutes([1, 2, 3], 3, { version: 'v1', count: 4 })).toBeNull()
  })

  it('should reject an oversized tile', () => {
    expect(() => checkTiles(tiles(MAX_TILE_BYTES + 1))).toThrow('z11')
  })

  it('should reject a build with a zoom level missing', () => {
    expect(() => checkTiles(tiles().slice(1))).toThrow('No tiles at z11')
  })

  it('should write no redirect when republishing the same version', () => {
    expect(pagesRedirects('v1', { version: 'v1', count: 1 })).toBe('')
  })

  it('should write no redirect on the first publish', () => {
    expect(pagesRedirects('v1', null)).toBe('')
  })
})
