import { sessionUser } from '@/core/auth/session-user';
import { createLogger } from '@/core/logging/logger';

import { isReachable } from './online';
import { offlineSignals } from './signals';
import {
  bumpAttempt,
  countPending,
  deadLetter,
  listDeadLetters,
  peekAllOrdered,
  remove,
  type DeadReason,
  type WriteQueueEntry,
} from './write-queue';

/**
 * Drains the outbox (offline-write-sync, DC3), ported from the PWA: each entry of the signed-in user
 * goes to its kind's handler in `seq` order. A handler makes one idempotent server call; it throws
 * `PermanentReplayError` for a failure that must not be retried (validation, RLS, 404, a lost
 * last-write-wins) and anything else for a transient one. One bad entry never blocks the rest, and
 * the drain is single-flight so the reconnect refetch can wait for it (DC4).
 */
export type ReplayHandler = (entry: WriteQueueEntry) => Promise<void>;

export class PermanentReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentReplayError';
  }
}

const log = createLogger('Replay');
const handlers = new Map<string, ReplayHandler>();

/** Stores wire their `kind` to a handler at module load. */
export function registerReplay(kind: string, handler: ReplayHandler): void {
  handlers.set(kind, handler);
}

/** Test seam. */
export function clearReplayHandlers(): void {
  handlers.clear();
}

const MAX_ATTEMPTS = 5;

function backoff(attempts: number): number {
  return Math.min(1000 * 2 ** (attempts - 1), 30_000) + Math.random() * 1000;
}

/**
 * An entry whose payload names an entity that dead-lettered would 404 (an offline-created contact
 * that failed, as a tour's partner). ponytail: substring scan for the dead ids; UUIDs make false
 * positives practically impossible. Add explicit `deps` if a non-UUID id ever rides in a payload.
 */
function referencesDead(entry: WriteQueueEntry, deadIds: Set<string>): boolean {
  if (deadIds.size === 0) return false;
  const serialized = JSON.stringify(entry.payload);
  return [...deadIds].some((id) => serialized.includes(id));
}

/** Re-reads the outbox's counts for the banner and the review list. */
export async function refreshQueueStatus(): Promise<void> {
  const userId = sessionUser.getState().id;
  if (!userId) {
    offlineSignals.setState({ pendingCount: 0, deadLetters: [] });
    return;
  }
  try {
    const [pendingCount, deadLetters] = await Promise.all([
      countPending(userId),
      listDeadLetters(userId),
    ]);
    offlineSignals.setState({ pendingCount, deadLetters });
  } catch (error) {
    log.warn('Could not read the outbox', error);
  }
}

async function runDrain(): Promise<void> {
  const userId = sessionUser.getState().id;
  if (!userId || !isReachable()) return;

  const entries = await peekAllOrdered(userId);
  const deadIds = new Set<string>();
  let nextRetry = Number.POSITIVE_INFINITY;
  const kill = async (id: string, reason: DeadReason = 'permanent') => {
    await deadLetter(id, reason);
    deadIds.add(id);
  };

  for (const entry of entries) {
    // Signed out or switched user mid-drain: stop; the rest stays for its owner.
    if (sessionUser.getState().id !== userId) break;
    if (referencesDead(entry, deadIds)) {
      await kill(entry.entityId);
      continue;
    }
    const handler = handlers.get(entry.kind);
    if (!handler) {
      await kill(entry.entityId);
      continue;
    }
    try {
      await handler(entry);
      await remove(entry.entityId);
    } catch (error) {
      if (error instanceof PermanentReplayError || entry.attempts + 1 >= MAX_ATTEMPTS) {
        const reason: DeadReason =
          error instanceof PermanentReplayError
            ? /LWW/i.test(error.message)
              ? 'conflict'
              : 'permanent'
            : 'transient';
        log.warn(`Gave up on ${entry.kind} ${entry.entityId}: ${reason}`, error);
        await kill(entry.entityId, reason);
      } else {
        await bumpAttempt(entry.entityId);
        nextRetry = Math.min(nextRetry, backoff(entry.attempts + 1));
      }
    }
  }

  if (nextRetry !== Number.POSITIVE_INFINITY) setTimeout(() => void replayQueue(), nextRetry);
  offlineSignals.setState({ drainedAt: Date.now() });
  await refreshQueueStatus();
}

let drain: Promise<void> | null = null;

/** Starts a drain, or joins the running one. The returned promise is the DC4 gate. */
export function replayQueue(): Promise<void> {
  drain ??= runDrain().finally(() => {
    drain = null;
  });
  return drain;
}

/** DC4: drain first, then refetch, so a replayed write is never clobbered by the snapshot. */
export async function flushThenRefetch(refetch: () => Promise<void>): Promise<void> {
  await replayQueue().catch(() => {});
  await refetch();
}
