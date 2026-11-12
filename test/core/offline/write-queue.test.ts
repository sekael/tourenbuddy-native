import { coalesce, type WriteQueueEntry } from '@/core/offline/write-queue';

// Ported from the PWA's write-queue.test.ts: the coalescing rules (DC1).
const entry = (over: Partial<WriteQueueEntry>): WriteQueueEntry => ({
  entityId: 't1',
  kind: 'tour',
  op: 'create',
  payload: { id: 't1', name: 'a' },
  seq: 1,
  attempts: 0,
  userId: 'u1',
  ...over,
});

describe('coalesce', () => {
  it('should annihilate create + delete (the row never reached the server)', () => {
    expect(coalesce(entry({ op: 'create' }), entry({ op: 'delete', seq: 2 }))).toBeNull();
  });

  it('should keep a tombstone for none + delete', () => {
    expect(coalesce(undefined, entry({ op: 'delete' }))?.op).toBe('delete');
  });

  it('should keep create with the newer payload on create + update', () => {
    const merged = coalesce(
      entry({ op: 'create' }),
      entry({ op: 'update', payload: { name: 'b' }, seq: 9 }),
    );
    expect(merged).toMatchObject({ op: 'create', payload: { name: 'b' }, seq: 1 });
  });

  it('should keep the FIRST baseline on update + update', () => {
    const first = entry({
      op: 'update',
      baseSnapshot: { name: 'orig' },
      baseUpdatedAt: 't0',
      payload: { name: 'b' },
    });
    const merged = coalesce(
      first,
      entry({
        op: 'update',
        baseSnapshot: { name: 'b' },
        baseUpdatedAt: 't1',
        payload: { name: 'c' },
      }),
    );
    expect(merged).toMatchObject({
      baseSnapshot: { name: 'orig' },
      baseUpdatedAt: 't0',
      payload: { name: 'c' },
    });
  });

  it('should annihilate an update that returns to its baseline, whatever the key order', () => {
    const first = entry({
      op: 'update',
      baseSnapshot: { id: 't1', name: 'orig' },
      payload: { id: 't1', name: 'b' },
    });
    expect(
      coalesce(first, entry({ op: 'update', payload: { name: 'orig', id: 't1' } })),
    ).toBeNull();
  });

  it('should keep an update to a different value than the baseline', () => {
    const first = entry({ op: 'update', baseSnapshot: { name: 'orig' }, payload: { name: 'b' } });
    expect(coalesce(first, entry({ op: 'update', payload: { name: 'c' } }))).not.toBeNull();
  });

  it('should turn update + delete into a tombstone with a fresh attempt budget', () => {
    const merged = coalesce(entry({ op: 'update', attempts: 3 }), entry({ op: 'delete' }));
    expect(merged).toMatchObject({ op: 'delete', attempts: 0 });
  });

  it('should never revive a deleted entity', () => {
    expect(coalesce(entry({ op: 'delete' }), entry({ op: 'update' }))?.op).toBe('delete');
  });
});
