import { createLogger } from '@/core/logging/logger';

import { tables, type Tables } from './tables';

/**
 * Last-known-good snapshots of store-loaded collections, keyed `<collection>:<uid>` so one account
 * never reads another's (offline-data-cache). JSON in the offline database; `Date`, `Set` and `Map`
 * survive the round trip, as they did in the PWA's IndexedDB.
 */
const log = createLogger('EntityCache');

// `JSON.stringify` turns a Date into a string before the replacer sees it, so the replacer reads
// the original from its holder (`this`). Dates come back as Dates: drafts and tours carry them.
function replacer(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key];
  if (raw instanceof Date) return { __date: raw.toISOString() };
  if (value instanceof Set) return { __set: [...value] };
  if (value instanceof Map) return { __map: [...value] };
  return value;
}

function reviver(_key: string, value: unknown) {
  if (value && typeof value === 'object') {
    if ('__date' in value) return new Date((value as { __date: string }).__date);
    if ('__set' in value) return new Set((value as { __set: unknown[] }).__set);
    if ('__map' in value) return new Map((value as { __map: [unknown, unknown][] }).__map);
  }
  return value;
}

export const serialize = (value: unknown): string => JSON.stringify(value, replacer);
export const deserialize = <T>(json: string): T => JSON.parse(json, reviver) as T;

/** A cached collection, or `undefined` for a never-written key. */
export async function getCached<T>(key: string): Promise<T | undefined> {
  const json = await (await tables()).get('cache', key);
  return json === undefined ? undefined : deserialize<T>(json);
}

/** Overwrite the snapshot for `key`. */
export async function putCached<T>(key: string, value: T, tx?: Tables): Promise<void> {
  log.debug('put cached', key);
  await (tx ?? (await tables())).put('cache', key, serialize(value));
}

export async function clearCached(key: string): Promise<void> {
  await (await tables()).delete('cache', key);
}

/**
 * Forget every snapshot of one user (sign-out): keys end in `:<uid>`. Their unsynced writes stay
 * in the outbox, tagged with their id, for their next sign-in on this device.
 */
export async function clearUserCache(userId: string): Promise<void> {
  const db = await tables();
  const rows = await db.all('cache');
  await Promise.all(
    rows.filter((row) => row.key.endsWith(`:${userId}`)).map((row) => db.delete('cache', row.key)),
  );
}
