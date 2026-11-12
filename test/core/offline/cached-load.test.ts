import { sessionTrust } from '@/core/auth/session-trust';
import { cachedLoad, resetCachedLoad } from '@/core/offline/cached-load';
import { getCached, putCached } from '@/core/offline/entity-cache';
import { connectivity } from '@/core/offline/online';

import { fakeTables } from '../../support/fake-tables';

// Ported from the PWA's cached-load.test.ts (hydrate, then refetch when reachable).
describe('cachedLoad', () => {
  beforeEach(async () => {
    fakeTables.reset();
    resetCachedLoad();
    connectivity.setState({ online: true });
    sessionTrust.setState({ unverified: false });
    await putCached('tours:u1', ['cached']);
  });

  it('should serve the cache without fetching on an unverified session, even online', async () => {
    sessionTrust.setState({ unverified: true });
    const fetcher = jest.fn();
    const assign = jest.fn();
    await cachedLoad('tours:u1', fetcher, assign);
    expect(fetcher).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(['cached']);
  });

  it('should assign the cache offline and never fetch or overwrite it', async () => {
    connectivity.setState({ online: false });
    const fetcher = jest.fn();
    await cachedLoad('tours:u1', fetcher, jest.fn());
    expect(fetcher).not.toHaveBeenCalled();
    expect(await getCached('tours:u1')).toEqual(['cached']);
  });

  it('should keep the cached snapshot and rethrow when the fetch fails', async () => {
    const assign = jest.fn();
    await expect(
      cachedLoad('tours:u1', () => Promise.reject(new Error('500')), assign),
    ).rejects.toThrow('500');
    expect(assign).toHaveBeenCalledTimes(1);
    expect(await getCached('tours:u1')).toEqual(['cached']);
  });

  it('should skip the cache paint on a warm reload so a stale snapshot never flickers in', async () => {
    await cachedLoad('tours:u1', async () => ['fresh'], jest.fn());
    await putCached('tours:u1', ['stale']);
    const assign = jest.fn();
    await cachedLoad('tours:u1', async () => ['fresher'], assign);
    expect(assign.mock.calls).toEqual([[['fresher']]]);
  });
});
