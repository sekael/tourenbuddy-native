import { loadCachedText } from '@/core/offline/file-cache';
import { parseGpxText } from '@/features/tours/data/services/gpx-parser';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';

jest.mock('@/core/offline/file-cache', () => ({ loadCachedText: jest.fn() }));
jest.mock('@/features/tours/data/services/gpx-storage-service', () => ({
  getSignedUrl: jest.fn(),
}));
jest.mock('@/features/tours/data/services/gpx-parser', () => ({ parseGpxText: jest.fn() }));

const track = (name: string) =>
  ({ type: 'FeatureCollection', features: [], name }) as GeoJSON.FeatureCollection;

describe('loadGpxTrack', () => {
  beforeEach(() => {
    jest.mocked(loadCachedText).mockResolvedValue('<gpx/>');
  });

  it('should fetch and parse once for callers asking at the same time (map + route numbers)', async () => {
    jest.mocked(parseGpxText).mockReturnValueOnce(track('v1'));
    const tour = { id: 'same-time', gpxFilepath: 'u/same-time.gpx' };
    const [a, b] = await Promise.all([loadGpxTrack(tour), loadGpxTrack(tour)]);
    expect(a).toBe(b);
    expect(parseGpxText).toHaveBeenCalledTimes(1);
  });

  it('should keep the parse across a row-only write and load a replaced track from its new path', async () => {
    jest.mocked(parseGpxText).mockReturnValueOnce(track('old')).mockReturnValueOnce(track('new'));
    const fetches = jest.mocked(loadCachedText).mock.calls.length;
    const tour: { id: string; gpxFilepath: string; updatedAt?: string } = {
      id: 'replaced',
      gpxFilepath: 'u/a.gpx',
      updatedAt: '1',
    };
    expect(await loadGpxTrack(tour)).toEqual(track('old'));
    // Marked completed / visibility toggled: the row's `updatedAt` moves on, the file does not.
    const written = { ...tour, updatedAt: '2' };
    expect(await loadGpxTrack(written)).toEqual(track('old'));
    const replaced = { ...tour, gpxFilepath: 'u/b.gpx', updatedAt: '3' };
    expect(await loadGpxTrack(replaced)).toEqual(track('new'));
    expect(jest.mocked(loadCachedText).mock.calls.length - fetches).toBe(2);
  });

  it('should give no track when the bytes cannot be had offline', async () => {
    jest.mocked(loadCachedText).mockResolvedValueOnce(undefined);
    expect(await loadGpxTrack({ id: 'offline', gpxFilepath: 'u/offline.gpx' })).toBeNull();
  });
});
