import { deserialize, serialize } from './entity-cache';
import { tables, transaction } from './tables';

/**
 * The durable outbox (offline-write-sync, DC1), ported from the PWA's IndexedDB queue onto the
 * offline database. One entry per entity, keyed by its client-minted id; `seq` orders replay across
 * entities (foreign keys). Each entry carries the user who made it, so it never replays under
 * another account (AUTH-4).
 */
export type WriteOp = 'create' | 'update' | 'delete';
export type DeadReason = 'conflict' | 'permanent' | 'transient';

export type WriteQueueEntry = {
  /** Client-minted UUID: the entity already has its final id (no temp → server remap). */
  entityId: string;
  /** Picks the replay handler (`'tour' | 'contact' | …`). */
  kind: string;
  /** Net effect on the server row. */
  op: WriteOp;
  /** The entity's full final desired state; later edits replace it. */
  payload: unknown;
  /** `update` only: the pre-edit server state, so a discard restores it. */
  baseSnapshot?: unknown;
  /** `update` only: `baseSnapshot`'s server `updated_at`, the last-write-wins baseline (DC5). */
  baseUpdatedAt?: string;
  /** Monotonic insertion counter, kept on coalesce. */
  seq: number;
  /** Replay attempts so far: drives backoff and dead-lettering. */
  attempts: number;
  /** Who made the change; only their session replays it. */
  userId: string;
  /**
   * Dead letters only: `conflict` (lost last-write-wins; discard only), `permanent` (rejected by
   * the server; discard only), `transient` (out of retries; a manual retry may land).
   */
  deadReason?: DeadReason;
};

/** A fresh mutation; `mutate()` adds the bookkeeping. */
export type IncomingWrite = Omit<WriteQueueEntry, 'seq' | 'attempts' | 'userId' | 'deadReason'>;

const parse = (json: string) => deserialize<WriteQueueEntry>(json);

export async function getEntry(entityId: string): Promise<WriteQueueEntry | undefined> {
  const json = await (await tables()).get('queue', entityId);
  return json === undefined ? undefined : parse(json);
}

/** Pending entries of `userId` (all users when omitted) in replay order. */
export async function peekAllOrdered(userId?: string): Promise<WriteQueueEntry[]> {
  const rows = await (await tables()).all('queue');
  return rows
    .map((row) => parse(row.value))
    .filter((entry) => userId === undefined || entry.userId === userId)
    .sort((a, b) => a.seq - b.seq);
}

export async function remove(entityId: string): Promise<void> {
  await (await tables()).delete('queue', entityId);
}

export async function bumpAttempt(entityId: string): Promise<void> {
  const entry = await getEntry(entityId);
  if (!entry) return;
  entry.attempts += 1;
  await (await tables()).put('queue', entityId, serialize(entry));
}

/** Moves an entry to the dead letters so it stops blocking the drain (DC9). */
export async function deadLetter(
  entityId: string,
  reason: DeadReason = 'permanent',
): Promise<void> {
  await transaction(async (tx) => {
    const json = await tx.get('queue', entityId);
    if (json === undefined) return;
    await tx.put('dead', entityId, serialize({ ...parse(json), deadReason: reason }));
    await tx.delete('queue', entityId);
  });
}

export async function countPending(userId: string): Promise<number> {
  return (await peekAllOrdered(userId)).length;
}

export async function listDeadLetters(userId: string): Promise<WriteQueueEntry[]> {
  const rows = await (await tables()).all('dead');
  return rows.map((row) => parse(row.value)).filter((entry) => entry.userId === userId);
}

/**
 * Gives up on a dead letter.
 * ponytail: the optimistic cache is not reverted; the next refetch replaces it (the user is online
 * to see this surface). Revert from `baseSnapshot` if a discard must show at once offline.
 */
export async function discardDeadLetter(entityId: string): Promise<void> {
  await (await tables()).delete('dead', entityId);
}

/** Moves a dead letter back to the queue with a fresh attempt budget. */
export async function retryDeadLetter(entityId: string): Promise<void> {
  await transaction(async (tx) => {
    const json = await tx.get('dead', entityId);
    if (json === undefined) return;
    const { deadReason: _reason, ...entry } = parse(json);
    await tx.put('queue', entityId, serialize({ ...entry, attempts: 0 }));
    await tx.delete('dead', entityId);
  });
}

/**
 * Key-sorted JSON: detects an update that nets back to its baseline. Arrays keep their order.
 * ponytail: JSON canonical form, not a deep-equal library; payloads are plain serializable data.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * Folds an incoming mutation into the entity's pending entry (DC1). Pure. `null` annihilates.
 *
 *   (none) + any            → incoming               create + delete → null
 *   create + update         → newer payload, create  update + delete → delete tombstone
 *   update + update         → newer payload, first baseline
 *   update back to baseline → null                   delete + any    → delete (ids never reused)
 */
export function coalesce(
  existing: WriteQueueEntry | undefined,
  incoming: WriteQueueEntry,
): WriteQueueEntry | null {
  if (existing === undefined) return { ...incoming };
  if (existing.op === 'delete') return { ...existing };
  if (incoming.op === 'delete') {
    return existing.op === 'create' ? null : { ...existing, attempts: 0, op: 'delete' };
  }
  if (
    existing.op === 'update' &&
    existing.baseSnapshot !== undefined &&
    canonical(incoming.payload) === canonical(existing.baseSnapshot)
  ) {
    return null;
  }
  return { ...existing, attempts: 0, payload: incoming.payload };
}
