import { sessionTrust } from '@/core/auth/session-trust';
import { sessionUser } from '@/core/auth/session-user';
import { serialize } from '@/core/offline/entity-cache';
import { connectivity } from '@/core/offline/online';
import {
  clearReplayHandlers,
  flushThenRefetch,
  PermanentReplayError,
  registerReplay,
  replayQueue,
} from '@/core/offline/replay';
import { tables } from '@/core/offline/tables';
import { getEntry, listDeadLetters, type WriteQueueEntry } from '@/core/offline/write-queue';

import { fakeTables } from '../../support/fake-tables';

// Ported from the PWA's replay.test.ts and reconnect.test.ts, plus the user scoping (AUTH-4).
async function queue(over: Partial<WriteQueueEntry> & { entityId: string; seq: number }) {
  const entry: WriteQueueEntry = {
    kind: 'tour',
    op: 'create',
    payload: {},
    attempts: 0,
    userId: 'u1',
    ...over,
  };
  await (await tables()).put('queue', entry.entityId, serialize(entry));
}

describe('replayQueue', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    fakeTables.reset();
    clearReplayHandlers();
    connectivity.setState({ online: true });
    sessionTrust.setState({ unverified: false });
    sessionUser.setState({ id: 'u1' });
  });

  afterEach(() => jest.useRealTimers());

  it('should not drain without a session, burning no attempt', async () => {
    sessionUser.setState({ id: null });
    const handler = jest.fn();
    registerReplay('tour', handler);
    await queue({ entityId: 'a', seq: 1 });
    await replayQueue();
    expect(handler).not.toHaveBeenCalled();
    expect((await getEntry('a'))?.attempts).toBe(0);
  });

  it('should not drain while offline', async () => {
    connectivity.setState({ online: false });
    const handler = jest.fn();
    registerReplay('tour', handler);
    await queue({ entityId: 'a', seq: 1 });
    await replayQueue();
    expect(handler).not.toHaveBeenCalled();
  });

  it("should replay only the signed-in user's entries, in seq order", async () => {
    const seen: string[] = [];
    registerReplay('tour', async (entry) => void seen.push(entry.entityId));
    await queue({ entityId: 'b', seq: 2 });
    await queue({ entityId: 'a', seq: 1 });
    await queue({ entityId: 'other', seq: 3, userId: 'u2' });
    await replayQueue();
    expect(seen).toEqual(['a', 'b']);
    expect(await getEntry('other')).toBeDefined();
  });

  it('should stop when the user changes mid-drain, leaving the rest for its owner', async () => {
    registerReplay('tour', async () => sessionUser.setState({ id: 'u2' }));
    await queue({ entityId: 'a', seq: 1 });
    await queue({ entityId: 'b', seq: 2 });
    await replayQueue();
    expect(await getEntry('b')).toBeDefined();
  });

  it('should bump attempts on a transient failure without dead-lettering', async () => {
    registerReplay('tour', async () => {
      throw new Error('network');
    });
    await queue({ entityId: 'a', seq: 1 });
    await replayQueue();
    expect((await getEntry('a'))?.attempts).toBe(1);
    expect(await listDeadLetters('u1')).toEqual([]);
  });

  it('should dead-letter a permanent failure and keep draining', async () => {
    const handler = jest.fn(async (entry: WriteQueueEntry) => {
      if (entry.entityId === 'a') throw new PermanentReplayError('rls');
    });
    registerReplay('tour', handler);
    await queue({ entityId: 'a', seq: 1 });
    await queue({ entityId: 'b', seq: 2 });
    await replayQueue();
    expect(handler).toHaveBeenCalledTimes(2);
    expect((await listDeadLetters('u1')).map((e) => [e.entityId, e.deadReason])).toEqual([
      ['a', 'permanent'],
    ]);
  });

  it('should dead-letter a lost last-write-wins as a conflict and a capped transient as retryable', async () => {
    registerReplay('tour', async (entry) => {
      throw entry.entityId === 'a' ? new PermanentReplayError('LWW loser') : new Error('5xx');
    });
    await queue({ entityId: 'a', seq: 1 });
    await queue({ entityId: 'b', seq: 2, attempts: 4 });
    await replayQueue();
    const reasons = Object.fromEntries(
      (await listDeadLetters('u1')).map((e) => [e.entityId, e.deadReason]),
    );
    expect(reasons).toEqual({ a: 'conflict', b: 'transient' });
  });

  it('should cascade a dead create to an entry that references it', async () => {
    registerReplay('contact', async () => {
      throw new PermanentReplayError('validation');
    });
    const tourHandler = jest.fn();
    registerReplay('tour', tourHandler);
    await queue({ entityId: 'c-11111111', seq: 1, kind: 'contact' });
    await queue({ entityId: 't', seq: 2, payload: { partnerIds: ['c-11111111'] } });
    await replayQueue();
    expect(tourHandler).not.toHaveBeenCalled();
    expect((await listDeadLetters('u1')).map((e) => e.entityId).sort()).toEqual([
      'c-11111111',
      't',
    ]);
  });

  it('should refetch only after the drain, and still refetch when the drain fails', async () => {
    const order: string[] = [];
    registerReplay('tour', async () => void order.push('replay'));
    await queue({ entityId: 'a', seq: 1 });
    await flushThenRefetch(async () => void order.push('refetch'));
    expect(order).toEqual(['replay', 'refetch']);
  });
});
