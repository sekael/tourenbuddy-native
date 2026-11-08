import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCachedBlob } from '@/core/offline/blob-cache'
import { parseGpxFile } from '@/features/tours/data/services/gpx-parser'
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service'

vi.mock('@/core/offline/blob-cache', () => ({ loadCachedBlob: vi.fn() }))
vi.mock('@/features/tours/data/services/gpx-storage-service', () => ({ getSignedUrl: vi.fn() }))
vi.mock('@/features/tours/data/services/gpx-parser', () => ({ parseGpxFile: vi.fn() }))

const track = (name: string) => ({ type: 'FeatureCollection', features: [], name }) as GeoJSON.FeatureCollection

describe('loadGpxTrack', () => {
  beforeEach(() => {
    vi.mocked(loadCachedBlob).mockResolvedValue(new Blob(['<gpx/>']))
  })

  it('should fetch and parse once for callers asking at the same time (map + route numbers)', async () => {
    vi.mocked(parseGpxFile).mockResolvedValueOnce(track('v1'))
    const tour = { id: 'same-time', gpxFilepath: 'u/same-time.gpx', updatedAt: '1' }
    const [a, b] = await Promise.all([loadGpxTrack(tour), loadGpxTrack(tour)])
    expect(a).toBe(b)
    expect(parseGpxFile).toHaveBeenCalledTimes(1)
  })

  it('should keep the parse across a row-only write and load a replaced track from its new path', async () => {
    vi.mocked(parseGpxFile).mockResolvedValueOnce(track('old')).mockResolvedValueOnce(track('new'))
    const fetches = vi.mocked(loadCachedBlob).mock.calls.length
    const tour = { id: 'replaced', gpxFilepath: 'u/a.gpx', updatedAt: '1' }
    expect(await loadGpxTrack(tour)).toEqual(track('old'))
    // Marked completed / visibility toggled: the row's `updatedAt` moves on, the file does not.
    expect(await loadGpxTrack({ ...tour, updatedAt: '2' })).toEqual(track('old'))
    expect(await loadGpxTrack({ ...tour, gpxFilepath: 'u/b.gpx', updatedAt: '3' })).toEqual(track('new'))
    expect(vi.mocked(loadCachedBlob).mock.calls.length - fetches).toBe(2)
  })

  it('should give no track when the bytes cannot be had offline', async () => {
    vi.mocked(loadCachedBlob).mockResolvedValueOnce(undefined)
    expect(await loadGpxTrack({ id: 'offline', gpxFilepath: 'u/offline.gpx' })).toBeNull()
  })
})
