import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Tour } from '@/features/tours/domain/entities/tour'
import { describe, expect, it, vi } from 'vitest'
import { loadCachedBlob } from '@/core/offline/blob-cache'
import { outingGapLines, tourConnectors, trackGradient, useGpxTrackLayer } from '@/features/map/presentation/components/gpx-track-layer'
import { TOUR_TYPE_COLORS, TOUR_TYPE_TRACK_COLORS } from '@/features/tours/data/models/tour-type'
import { useGpxCache } from '@/features/tours/data/services/gpx-cache'

vi.mock('@/core/offline/blob-cache', () => ({ loadCachedBlob: vi.fn() }))
vi.mock('@/features/tours/data/services/gpx-storage-service', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/features/tours/data/services/gpx-parser', () => ({
  parseGpxFile: vi.fn(async () => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { late: true } }] })),
}))

function hexToLightness(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}

describe('tOUR_TYPE_TRACK_COLORS', () => {
  it('should have an entry for every TOUR_TYPE_COLORS key', () => {
    for (const type of Object.keys(TOUR_TYPE_COLORS)) {
      expect(TOUR_TYPE_TRACK_COLORS).toHaveProperty(type)
    }
  })

  it('track color should be darker than marker color for every tour type', () => {
    for (const [type, markerColor] of Object.entries(TOUR_TYPE_COLORS)) {
      const trackColor = TOUR_TYPE_TRACK_COLORS[type as keyof typeof TOUR_TYPE_TRACK_COLORS]
      expect(hexToLightness(trackColor)).toBeLessThan(hexToLightness(markerColor))
    }
  })

  it('track colors should stay within ~18pp of the marker and never turn near-black', () => {
    for (const [type, markerColor] of Object.entries(TOUR_TYPE_COLORS)) {
      const track = hexToLightness(TOUR_TYPE_TRACK_COLORS[type as keyof typeof TOUR_TYPE_TRACK_COLORS])
      expect(hexToLightness(markerColor) - track).toBeLessThan(0.19)
      expect(track).toBeGreaterThan(0.2)
    }
  })
})

describe('trackGradient', () => {
  const stops = (colors: string[]) => (trackGradient(colors) as unknown[]).slice(3)

  it('renders an untyped track in the fallback colour', () => {
    expect(stops([])).toEqual([0, '#555555', 1, '#555555'])
  })

  it('renders a single colour solid, with no bands', () => {
    expect(stops(['#0c396d'])).toEqual([0, '#0c396d', 1, '#0c396d'])
  })

  it('bands two colours with strictly ascending stops from 0 to 1', () => {
    const s = stops(['#0c396d', '#8f1717'])
    const inputs = s.filter((_, i) => i % 2 === 0) as number[]
    expect(inputs[0]).toBe(0)
    expect(inputs.at(-1)).toBe(1)
    expect(inputs.every((v, i) => i === 0 || v > inputs[i - 1]!)).toBe(true)
    // Alternates: band 1 blue, band 2 red, ... — a fade, not one hard switch halfway.
    expect(s.filter((_, i) => i % 2 === 1).slice(0, 4)).toEqual(['#0c396d', '#0c396d', '#8f1717', '#8f1717'])
  })
})

describe('useGpxTrackLayer — several tracks (#338)', () => {
  const EMPTY = { type: 'FeatureCollection', features: [] }
  const track = (name: string) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name } }] }) as unknown as GeoJSON.FeatureCollection
  const tour = (id: string) => ({ id, gpxFilepath: `u/${id}.gpx`, tourTypes: ['hiking'] }) as unknown as Tour

  function stubMap() {
    const sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {}
    return {
      addSource: vi.fn((id: string) => { sources[id] = { setData: vi.fn() } }),
      getSource: vi.fn((id: string) => sources[id]),
      addLayer: vi.fn(),
      getLayer: vi.fn(() => null),
      hasImage: vi.fn(() => false),
      addImage: vi.fn(),
      setPaintProperty: vi.fn(),
      lastData: (id: string) => sources[id]?.setData.mock.calls.at(-1)?.[0],
    }
  }

  it('should draw one slot per track', async () => {
    useGpxCache().set('u/a.gpx', track('a'))
    useGpxCache().set('u/b.gpx', track('b'))
    const map = stubMap()
    const layer = useGpxTrackLayer(map as unknown as MapLibreMap)
    layer.setup()
    await layer.updateTracks([tour('a'), tour('b')])

    expect(map.lastData('gpx-track-0')).toEqual(track('a'))
    expect(map.lastData('gpx-track-1')).toEqual(track('b'))
    expect(map.setPaintProperty).toHaveBeenCalledWith('gpx-track-line-1', 'line-opacity', 0.85)
  })

  it('should draw a trackless tour\'s connector in a slot, thinner and lighter than a track', async () => {
    const map = stubMap()
    const layer = useGpxTrackLayer(map as unknown as MapLibreMap)
    layer.setup()
    const trackless = { id: 'c', gpxFilepath: null, tourTypes: ['hiking'], startPoint: { lng: 8, lat: 46 }, endPoint: null, goal: { lng: 8.1, lat: 46.1 } } as unknown as Tour
    await layer.updateTracks([trackless])

    expect(map.lastData('gpx-track-0').features).toHaveLength(1)
    expect(map.setPaintProperty).toHaveBeenCalledWith('gpx-track-line-0', 'line-width', 2)
    expect(map.setPaintProperty).toHaveBeenCalledWith('gpx-track-line-0', 'line-opacity', 0.7)
    // Marker palette, not the darker track one.
    expect(map.setPaintProperty).toHaveBeenCalledWith('gpx-track-line-0', 'line-gradient', trackGradient([TOUR_TYPE_COLORS.hiking]))
  })

  it('should not draw a track that finishes loading after the selection moved on', async () => {
    let finish!: (blob: Blob) => void
    const pending = new Promise<Blob>((resolve) => {
      finish = resolve
    })
    vi.mocked(loadCachedBlob).mockReturnValueOnce(pending)
    const map = stubMap()
    const layer = useGpxTrackLayer(map as unknown as MapLibreMap)
    layer.setup()

    const slow = layer.updateTracks([tour('slow')])
    await layer.updateTracks([])
    finish(new Blob(['<gpx/>']))
    await slow

    expect(map.lastData('gpx-track-0')).toEqual(EMPTY)
  })

  it('should never empty a track whose tour was marked completed or had its visibility toggled', async () => {
    useGpxCache().set('u/toggled.gpx', track('toggled'))
    const map = stubMap()
    const layer = useGpxTrackLayer(map as unknown as MapLibreMap)
    layer.setup()
    await layer.updateTracks([{ ...tour('toggled'), updatedAt: '1', completed: false } as Tour])
    // The server bumps `updatedAt` on every row write; the realtime refetch brings it in.
    await layer.updateTracks([{ ...tour('toggled'), updatedAt: '2', completed: true } as Tour])

    expect(map.getSource('gpx-track-0')!.setData).not.toHaveBeenCalledWith(EMPTY)
    expect(map.lastData('gpx-track-0')).toEqual(track('toggled'))
  })
})

describe('tourConnectors', () => {
  const A = { lng: 8, lat: 46 }
  const G = { lng: 8.1, lat: 46.1 }
  const E = { lng: 8.2, lat: 46 }
  const entry = (t: Partial<Tour>) => ({ gpxFilepath: null, tourTypes: [], startPoint: A, endPoint: null, goal: G, ...t }) as Tour
  const legs = (t: Partial<Tour>) => tourConnectors([entry(t)]).features.map(f => [f.geometry.coordinates, (f.properties!.arrow as string).includes('-both')])

  it('should draw nothing for a tour with a GPX track, or with only a goal', () => {
    expect(tourConnectors([entry({ gpxFilepath: 'u/a.gpx' }), entry({ startPoint: null })]).features).toEqual([])
  })

  it('should point start → goal → end along two one-way legs', () => {
    expect(legs({ endPoint: E })).toEqual([[[[8, 46], [8.1, 46.1]], false], [[[8.1, 46.1], [8.2, 46]], false]])
  })

  it('should draw a round trip as one two-way leg', () => {
    expect(legs({ endPoint: { ...A } })).toEqual([[[[8, 46], [8.1, 46.1]], true]])
  })

  it('should drop a leg between coinciding points', () => {
    expect(legs({ endPoint: { ...G } })).toHaveLength(1)
  })

  it('should point a stage connected without a start from its goal to its end, one way', () => {
    expect(legs({ startPoint: null, endPoint: E })).toEqual([[[[8.1, 46.1], [8.2, 46]], false]])
    expect(legs({ startPoint: null, endPoint: { ...G } })).toEqual([])
  })

  it('should colour the arrow like the band under it, per activity', () => {
    const arrows = (types: string[]) => tourConnectors([entry({ tourTypes: types as never })]).features.map(f => f.properties!.arrow)
    expect(arrows(['hiking'])).toEqual(['connector-arrow:#E11D48'])
    // Each outing segment keeps its own activity, in the marker palette.
    const segments = [entry({ tourTypes: ['hiking'] }), entry({ tourTypes: ['paragliding'] })]
    expect(tourConnectors(segments).features.map(f => f.properties!.arrow))
      .toEqual(['connector-arrow:#E11D48', 'connector-arrow:#D97706'])
    expect(arrows([])).toEqual(['connector-arrow:#555555'])
    expect(tourConnectors([entry({ endPoint: { ...A } })]).features[0]!.properties!.arrow).toMatch(/^connector-arrow-both:/)
  })
})

describe('legs on the map (activity-legs D5)', () => {
  const A = { lng: 8, lat: 46 }
  const G = { lng: 8.1, lat: 46.1 }
  const hikeAndFly = (t: Partial<Tour> = {}) => ({
    gpxFilepath: null,
    tourTypes: ['paragliding', 'hiking'],
    legs: { ascent: ['hiking'], descent: ['paragliding'] },
    startPoint: A,
    endPoint: { lng: 8.2, lat: 46 },
    goal: G,
    ...t,
  }) as Tour

  it('should colour each leg\'s arrow by its own activities', () => {
    expect(tourConnectors([hikeAndFly()]).features.map(f => f.properties!.arrow))
      .toEqual(['connector-arrow:#E11D48', 'connector-arrow:#D97706'])
  })

  it('should draw a split round trip as two legs, one arrow cannot wear both colours', () => {
    expect(tourConnectors([hikeAndFly({ endPoint: { ...A } })]).features.map(f => f.properties!.arrow))
      .toEqual(['connector-arrow:#E11D48', 'connector-arrow:#D97706'])
  })

  it('should draw only the way down of a split tour without a start, in its own colours', () => {
    expect(tourConnectors([hikeAndFly({ startPoint: null })]).features.map(f => f.properties!.arrow))
      .toEqual(['connector-arrow:#D97706'])
  })

  it('should switch a track\'s colours at the split with strictly ascending stops', () => {
    const stops = (trackGradient(['#a00000', '#00a000'], { at: 0.6, colors: ['#0000a0'] }) as unknown[]).slice(3)
    const inputs = stops.filter((_, i) => i % 2 === 0) as number[]
    expect(inputs.every((v, i) => i === 0 || v > inputs[i - 1]!)).toBe(true)
    expect(stops.at(-1)).toBe('#0000a0')
    expect(stops[stops.indexOf(0.6) + 1]).toBe('#00a000')
  })

  it('should keep one leg\'s colours when the goal sits at an end of the track', () => {
    expect(trackGradient(['#a00000'], { at: 1, colors: ['#0000a0'] })).toEqual(trackGradient(['#a00000']))
    expect(trackGradient(['#a00000'], { at: 0, colors: ['#0000a0'] })).toEqual(trackGradient(['#0000a0']))
  })
})

describe('outingGapLines', () => {
  const at = (lng: number, lat: number) => ({ lng, lat })
  const seg = (startPoint: { lng: number, lat: number } | null, goal: { lng: number, lat: number }, endPoint: { lng: number, lat: number } | null = null) =>
    ({ startPoint, goal, endPoint }) as Tour

  it('should link a finish to the next start only where they do not meet', () => {
    expect(outingGapLines([seg(at(8, 46), at(8.1, 46.1))]).features).toEqual([])
    expect(outingGapLines([seg(at(8, 46), at(8.1, 46.1)), seg(at(8.1, 46.1), at(8.2, 46))]).features).toEqual([])
    const [gap] = outingGapLines([seg(at(8, 46), at(8.1, 46.1), at(8.3, 46.3)), seg(at(8, 46), at(8.2, 46))]).features
    expect(gap!.geometry.coordinates).toEqual([[8.3, 46.3], [8, 46]])
  })
})
