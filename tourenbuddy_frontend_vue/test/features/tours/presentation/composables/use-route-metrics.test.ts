import type { Tour } from '@/features/tours/domain/entities/tour'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { loadCachedBlob } from '@/core/offline/blob-cache'
import { parseGpxFile } from '@/features/tours/data/services/gpx-parser'
import { useRouteMetrics } from '@/features/tours/presentation/composables/use-route-metrics'

vi.mock('@/core/offline/blob-cache', () => ({ loadCachedBlob: vi.fn() }))
vi.mock('@/features/tours/data/services/gpx-storage-service', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/features/tours/data/services/gpx-parser', () => ({ parseGpxFile: vi.fn() }))
const { mockProfile } = vi.hoisted(() => ({ mockProfile: vi.fn() }))
vi.mock('@/features/tours/data/services/swisstopo-profile-service', () => ({ getTrackProfile: mockProfile }))

const line: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[8, 46, 1000], [8.01, 46, 1100]] } }],
}
function tour(updatedAt: string) {
  return ({
    id: 'metrics',
    gpxFilepath: 'u/metrics.gpx',
    updatedAt,
    goal: { lng: 8.01, lat: 46 },
    startPoint: null,
    endPoint: null,
    elevation: 1500,
    startPointElevation: null,
    tourTypes: ['hiking'],
  }) as unknown as Tour
}

describe('useRouteMetrics', () => {
  it('should keep the track\'s numbers when the tour is marked completed or its visibility toggled', async () => {
    vi.mocked(loadCachedBlob).mockResolvedValueOnce(new Blob(['<gpx/>']))
    vi.mocked(parseGpxFile).mockResolvedValueOnce(line)
    const tours = ref([tour('1')])
    const metrics = useRouteMetrics(tours)
    await vi.waitFor(() => expect(metrics.value.get('metrics')!.distance).toBeGreaterThan(0))
    const before = metrics.value.get('metrics')

    tours.value = [tour('2')]
    await nextTick()
    expect(metrics.value.get('metrics')).toEqual(before)
    expect(loadCachedBlob).toHaveBeenCalledTimes(1)
  })

  it('should retry a failed track load on the next change instead of keeping the point numbers', async () => {
    vi.mocked(loadCachedBlob).mockResolvedValueOnce(undefined).mockResolvedValueOnce(new Blob(['<gpx/>']))
    vi.mocked(parseGpxFile).mockResolvedValueOnce(line)
    const flaky = (updatedAt: string) => ({ ...tour(updatedAt), id: 'flaky', gpxFilepath: 'u/flaky.gpx' }) as Tour
    const tours = ref([flaky('1')])
    const metrics = useRouteMetrics(tours)
    await new Promise(resolve => setTimeout(resolve)) // the failed load settles
    expect(metrics.value.get('flaky')!.distance).toBeNull()

    tours.value = [flaky('2')]
    await vi.waitFor(() => expect(metrics.value.get('flaky')!.distance).toBeGreaterThan(0))
  })

  it('should show no numbers while the track loads, never the start-goal estimate first', async () => {
    let answer!: (b: Blob) => void
    vi.mocked(loadCachedBlob).mockReturnValueOnce(new Promise((resolve) => {
      answer = resolve
    }))
    vi.mocked(parseGpxFile).mockResolvedValueOnce(line)
    const slow = { ...tour('1'), id: 'slow', gpxFilepath: 'u/slow.gpx', startPoint: { lng: 8, lat: 46 }, startPointElevation: 900 } as Tour
    const metrics = useRouteMetrics(ref([slow]))
    expect(metrics.value.get('slow')).toEqual({ ascent: null, descent: null, distance: null })
    answer(new Blob(['<gpx/>']))
    await vi.waitFor(() => expect(metrics.value.get('slow')!.ascent).toBe(100))
  })

  it('should count a track without heights with the terrain\'s heights along it', async () => {
    const flat: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[8, 46], [8.01, 46]] } }] }
    vi.mocked(loadCachedBlob).mockResolvedValueOnce(new Blob(['<gpx/>']))
    vi.mocked(parseGpxFile).mockResolvedValueOnce(flat)
    mockProfile.mockResolvedValueOnce({ line: [[8, 46], [8.005, 46], [8.01, 46]], heights: [1000, 1200, 1100] })
    const drawn = { ...tour('1'), id: 'drawn', gpxFilepath: 'u/drawn.gpx' } as Tour
    const metrics = useRouteMetrics(ref([drawn]))
    await vi.waitFor(() => expect(metrics.value.get('drawn')).toMatchObject({ ascent: 200, descent: 100 }))
  })
})
