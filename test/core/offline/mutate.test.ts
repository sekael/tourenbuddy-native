import { sessionTrust } from '@/core/auth/session-trust';
import { sessionUser } from '@/core/auth/session-user';
import { getCached } from '@/core/offline/entity-cache';
import { mutate, type MutateSpec } from '@/core/offline/mutate';
import { connectivity } from '@/core/offline/online';
import { offlineSignals } from '@/core/offline/signals';
import { getEntry, peekAllOrdered } from '@/core/offline/write-queue';

import { fakeTables } from '../../support/fake-tables';

// Ported from the PWA's mutate.test.ts and mutate-offline.test.ts.
type Row = { id: string; name: string };

function spec(entityId: string, over: Partial<MutateSpec<Row>> = {}): MutateSpec<Row> {
  return {
    run: () => {},
    intent: { entityId, kind: 'tour', op: 'create', payload: { id: entityId } },
    cacheKey: 'tours:u1',
    current: [],
    apply: (rows) => [...rows, { id: entityId, name: 'a' }],
    assign: jest.fn(),
    ...over,
  };
}

describe('mutate', () => {
  beforeEach(() => {
    fakeTables.reset();
    connectivity.setState({ online: true });
    sessionTrust.setState({ unverified: false });
    sessionUser.setState({ id: 'u1' });
    offlineSignals.setState({ offlineBlockedAt: 0, savedOfflineAt: 0, offlineWriteError: null });
  });

  it('should block an online-only action on an unverified session, even online', async () => {
    sessionTrust.setState({ unverified: true });
    const fn = jest.fn();
    expect(await mutate(fn)).toBeUndefined();
    expect(fn).not.toHaveBeenCalled();
    expect(offlineSignals.getState().offlineBlockedAt).toBeGreaterThan(0);
  });

  it('should queue while the session is unverified, tagged with the user', async () => {
    sessionTrust.setState({ unverified: true });
    const run = jest.fn();
    const outcome = await mutate(spec('t1', { run }));
    expect(outcome).toEqual({ queued: true, failed: false });
    expect(run).not.toHaveBeenCalled();
    expect(await getEntry('t1')).toMatchObject({ userId: 'u1', seq: 1, op: 'create' });
  });

  it('should keep ONE entry per entity across a create then an edit', async () => {
    connectivity.setState({ online: false });
    await mutate(spec('t1'));
    await mutate(spec('t2'));
    await mutate(
      spec('t1', {
        intent: { entityId: 't1', kind: 'tour', op: 'update', payload: { id: 't1', name: 'b' } },
      }),
    );
    const all = await peekAllOrdered();
    expect(all.map((e) => [e.entityId, e.op, e.seq])).toEqual([
      ['t1', 'create', 1],
      ['t2', 'create', 2],
    ]);
    expect(all[0]!.payload).toEqual({ id: 't1', name: 'b' });
  });

  it('should roll back the cache write when the commit fails, and leave the store untouched', async () => {
    connectivity.setState({ online: false });
    fakeTables.failNextCommit = true;
    const assign = jest.fn();
    const outcome = await mutate(spec('t1', { assign }));
    expect(outcome).toEqual({ queued: false, failed: true });
    expect(assign).not.toHaveBeenCalled();
    expect(await getCached('tours:u1')).toBeUndefined();
    expect(await getEntry('t1')).toBeUndefined();
    expect(offlineSignals.getState().offlineWriteError).toBe('offline.writeError.generic');
  });

  it('should refuse to queue without a signed-in user', async () => {
    connectivity.setState({ online: false });
    sessionUser.setState({ id: null });
    expect(await mutate(spec('t1'))).toEqual({ queued: false, failed: true });
    expect(await getEntry('t1')).toBeUndefined();
  });
});
