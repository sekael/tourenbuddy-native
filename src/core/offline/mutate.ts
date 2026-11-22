import { Paths } from 'expo-file-system';

import { sessionUser } from '@/core/auth/session-user';
import { createLogger } from '@/core/logging/logger';

import { putCached, serialize } from './entity-cache';
import { isReachable } from './online';
import { offlineSignals } from './signals';
import { offlineStorage, transaction } from './tables';
import { coalesce, type IncomingWrite, type WriteQueueEntry } from './write-queue';

const log = createLogger('Mutate');

/**
 * The single seam every mutation passes through (offline-write-sync), ported from the PWA.
 *
 * - **Block form** `mutate(fn)`: reachable, runs `fn`; otherwise refuses (`offlineBlockedAt`) and
 *   returns `undefined`. For writes that stay online-only (attachments, friend requests, push).
 * - **Queue form** `mutate(spec)`: reachable, runs `spec.run`; otherwise writes the next collection
 *   to the cache and the coalesced intent to the outbox in ONE transaction (DC2), then assigns the
 *   optimistic state. The web has no outbox (D8): it refuses like the block form.
 *
 * An unverified session counts as unreachable: its token is stale, so the server would reject the
 * write and the edit would be lost instead of queued.
 */
export type MutateSpec<Row> = {
  /** The online body, run verbatim when reachable. */
  run: () => Promise<Row[] | void> | Row[] | void;
  /** The queue intent; `baseSnapshot` / `baseUpdatedAt` set by the caller for updates. */
  intent: IncomingWrite;
  /** The collection's cache key, the one `cachedLoad` writes (`tours:<uid>`). */
  cacheKey: string;
  /** The store's current collection. */
  current: Row[];
  /** Pure transform to the next collection. */
  apply: (rows: Row[]) => Row[];
  /** Puts the next collection into the store, after the durable commit. */
  assign: (rows: Row[]) => void;
  /** Bytes the entry adds (staged files and slack), checked against free space. */
  projectedBytes?: number;
};

export type MutateOutcome<T> =
  | { queued: false; failed: false; value: T }
  | { queued: true; failed: false }
  | { queued: false; failed: true };

export function mutate<T>(fn: () => T | Promise<T>): Promise<T | undefined>;
export function mutate<Row>(spec: MutateSpec<Row>): Promise<MutateOutcome<Row[] | void>>;
export async function mutate(arg: unknown): Promise<unknown> {
  if (typeof arg === 'function') {
    if (!isReachable()) {
      offlineSignals.setState({ offlineBlockedAt: Date.now() });
      return undefined;
    }
    return (arg as () => unknown)();
  }

  const spec = arg as MutateSpec<unknown>;
  if (isReachable()) return { queued: false, failed: false, value: await spec.run() };

  if (!offlineStorage) {
    offlineSignals.setState({ offlineBlockedAt: Date.now() });
    return { queued: false, failed: true };
  }

  try {
    await enqueueOffline(spec);
  } catch (error) {
    log.error('Offline write enqueue failed', error);
    offlineSignals.setState({
      offlineWriteError:
        error instanceof Error && error.message === 'offline-queue-storage-full'
          ? 'offline.writeError.storageFull'
          : 'offline.writeError.generic',
    });
    return { queued: false, failed: true };
  }
  spec.assign(spec.apply(spec.current));
  offlineSignals.setState((state) => ({
    savedOfflineAt: Date.now(),
    pendingCount: state.pendingCount + 1,
  }));
  return { queued: true, failed: false };
}

export function clearOfflineWriteError(): void {
  offlineSignals.setState({ offlineWriteError: null });
}

/** Keep this much free beyond the entry, so a full disk refuses the write instead of corrupting. */
const DISK_SLACK = 20 * 1024 * 1024;

function assertHeadroom(projectedBytes: number) {
  let free = Infinity;
  try {
    free = Paths.availableDiskSpace;
  } catch {
    // Unknown free space never blocks a write.
  }
  if (projectedBytes + DISK_SLACK > free) throw new Error('offline-queue-storage-full');
}

async function enqueueOffline(spec: MutateSpec<unknown>): Promise<void> {
  const userId = sessionUser.getState().id;
  if (!userId) throw new Error('no-session');
  assertHeadroom(spec.projectedBytes ?? 0);
  const next = spec.apply(spec.current);

  await transaction(async (tx) => {
    const all = (await tx.all('queue')).map(
      (row) => JSON.parse(row.value) as Pick<WriteQueueEntry, 'seq'>,
    );
    const existingJson = await tx.get('queue', spec.intent.entityId);
    const existing = existingJson ? (JSON.parse(existingJson) as WriteQueueEntry) : undefined;
    const seq = existing?.seq ?? all.reduce((max, entry) => Math.max(max, entry.seq), 0) + 1;
    const merged = coalesce(existing, { ...spec.intent, seq, attempts: 0, userId });

    await putCached(spec.cacheKey, next, tx);
    if (merged === null) await tx.delete('queue', spec.intent.entityId);
    else await tx.put('queue', spec.intent.entityId, serialize(merged));
  });
}
