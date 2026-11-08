import { describe, expect, it } from 'vitest'
import {
  enumerateAssetUrls,
  enumerateSkiTiles,
  enumerateTiles,
  estimateBytes,
  orphanTileUrls,
} from '@/features/map/data/services/offline-tile-service'

// A small alpine bbox around Zermatt.
const bbox: [number, number, number, number] = [7.7, 45.9, 7.8, 46.0]

describe('enumerateTiles', () => {
  it('emits two source URLs (base + relief) per tile coordinate', () => {
    const urls = enumerateTiles(bbox, 10, 10)
    const base = urls.filter(u => u.includes('/ch.swisstopo.base.vt/'))
    const relief = urls.filter(u => u.includes('/ch.swisstopo.relief.vt/'))
    expect(base.length).toBe(relief.length)
    expect(base.length).toBeGreaterThan(0)
  })

  it('produces only canonical (bare-host) URLs, never a sharded host', () => {
    for (const u of enumerateTiles(bbox, 10, 11))
      expect(u).toMatch(/^https:\/\/vectortiles\.geo\.admin\.ch\//)
  })

  it('covers a tile boundary: a bbox spanning two tiles yields both x columns', () => {
    // At z2, lon 0 is the x=2|x=1 boundary; a bbox straddling it must include both.
    const spanning = enumerateTiles([-5, 10, 5, 20], 2, 2)
    const xs = new Set(spanning.map(u => u.match(/\/2\/(\d+)\//)![1]))
    expect(xs.size).toBeGreaterThanOrEqual(2)
  })

  it('handles an inverted bbox without emitting garbage (same set as its ordered form)', () => {
    const ordered = enumerateTiles([7.7, 45.9, 7.8, 46.0], 9, 9)
    const inverted = enumerateTiles([7.8, 46.0, 7.7, 45.9], 9, 9)
    expect(new Set(inverted)).toEqual(new Set(ordered))
  })

  it('a zero-area bbox (a point) yields exactly its two covering-tile URLs', () => {
    expect(enumerateTiles([7.75, 45.95, 7.75, 45.95], 12, 12)).toHaveLength(2)
  })
})

describe('estimateBytes', () => {
  it('is monotonic in zoom depth (deeper range ⇒ larger estimate)', () => {
    expect(estimateBytes(bbox, 0, 14)).toBeGreaterThan(estimateBytes(bbox, 0, 10))
  })

  it('is monotonic in area (bigger bbox ⇒ larger estimate)', () => {
    const big = estimateBytes([7.0, 45.5, 8.5, 46.5], 12, 12)
    const small = estimateBytes([7.7, 45.9, 7.8, 46.0], 12, 12)
    expect(big).toBeGreaterThan(small)
  })
})

describe('orphanTileUrls', () => {
  const region = (id: string, b: [number, number, number, number]) => ({
    id,
    label: id,
    bbox: b,
    minZoom: 12,
    maxZoom: 12,
    tileCount: 0,
    bytes: 0,
    createdAt: 0,
  })

  it('keeps tiles shared with a surviving overlapping region', () => {
    const target = region('a', [7.70, 45.90, 7.80, 46.00])
    const survivor = region('b', [7.75, 45.95, 7.85, 46.05]) // overlaps target
    const orphans = orphanTileUrls(target, [survivor])
    const survivorTiles = new Set(enumerateTiles(survivor.bbox, 12, 12))
    // No orphan may be a tile the survivor still needs.
    expect(orphans.some(u => survivorTiles.has(u))).toBe(false)
    // Non-overlapping part still gets purged.
    expect(orphans.length).toBeGreaterThan(0)
  })

  it('purges every tile when no region survives', () => {
    const target = region('a', [7.70, 45.90, 7.80, 46.00])
    expect(orphanTileUrls(target, [])).toEqual([...enumerateTiles(target.bbox, 12, 12), ...enumerateSkiTiles(target.bbox, 12, 12)])
  })

  it('keeps ski-route tiles shared with a surviving overlapping region', () => {
    const target = region('a', [7.70, 45.90, 7.80, 46.00])
    const survivor = region('b', [7.75, 45.95, 7.85, 46.05])
    const kept = new Set(enumerateSkiTiles(survivor.bbox, 12, 12))
    expect(orphanTileUrls(target, [survivor]).some(u => kept.has(u))).toBe(false)
  })
})

describe('enumerateSkiTiles', () => {
  it('should only cover the dataset zooms 11–13, whatever the region depth', () => {
    const zooms = new Set(enumerateSkiTiles(bbox, 0, 14).map(u => u.match(/\/(\d+)\/\d+\/\d+\.pbf$/)![1]))
    expect([...zooms]).toEqual(['11', '12', '13'])
  })

  it('should yield nothing for a region that stops above zoom 11', () => {
    expect(enumerateSkiTiles(bbox, 0, 10)).toEqual([])
  })

  it('should key tiles without the dataset version by default', () => {
    expect(enumerateSkiTiles(bbox, 11, 11)[0]).toMatch(/\/ski-routes\/11\/\d+\/\d+\.pbf$/)
  })
})

describe('enumerateAssetUrls', () => {
  it('expands a multi-sprite array into json + png + @2x for each entry', () => {
    const urls = enumerateAssetUrls({
      sprite: [
        { id: 'a', url: 'https://host/sprites/a/sprite' },
        { id: 'default', url: 'https://host/sprites/b/sprite' },
      ],
      glyphs: 'https://host/fonts/{fontstack}/{range}.pbf',
    })
    expect(urls).toContain('https://host/sprites/a/sprite@2x.png')
    expect(urls).toContain('https://host/sprites/b/sprite.json')
    // 5 font stacks × 5 ranges (Latin + General Punctuation) = 25 glyph URLs.
    expect(urls.filter(u => u.includes('/fonts/'))).toHaveLength(25)
  })
})
