import { stubGlobal, unstubAllGlobals } from '../../../../support/globals';
import { densify, getTrackProfile } from '@/features/tours/data/services/swisstopo-profile-service';

describe('swisstopoProfileService', () => {
  beforeEach(() => {
    stubGlobal('fetch', jest.fn());
  });

  afterEach(() => {
    unstubAllGlobals();
  });

  it('should add points to a long straight leg so the terrain between counts', () => {
    // ~770 m along a parallel → 31 stretches of at most 25 m.
    const line = densify([
      [8, 46],
      [8.01, 46],
    ]);
    expect(line).toHaveLength(32);
    expect(line.at(-1)).toEqual([8.01, 46]);
  });

  it('should give no profile when the service fails, and ask again next time', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(new Response('busy', { status: 503 }));
    expect(
      await getTrackProfile([
        [8.2, 46.2],
        [8.2001, 46.2],
      ]),
    ).toBeNull();
    jest.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { dist: 0, alts: { COMB: 1000 } },
          { dist: 7.7, alts: { COMB: null } },
        ]),
        { status: 200 },
      ),
    );
    const profile = await getTrackProfile([
      [8.2, 46.2],
      [8.2001, 46.2],
    ]);
    // A station without a height takes its neighbour's.
    expect(profile!.heights).toEqual([1000, 1000]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
