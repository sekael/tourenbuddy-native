import type { Table, Tables } from './tables';

export type { Table, Tables } from './tables';

/**
 * The web's offline database (the PWA works offline too): the same key-value tables as SQLite on
 * the phone, in one IndexedDB store keyed by `[table, key]`, so keys sort per table like
 * `ORDER BY key` and a prefix is a key range.
 */
const DB = 'tourenbuddy-tables';
const STORE = 'kv';

let opened: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opened;
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const store = async (mode: IDBTransactionMode) =>
  (await db()).transaction(STORE, mode).objectStore(STORE);
const range = (table: Table, prefix: string) =>
  IDBKeyRange.bound([table, prefix], [table, `${prefix}￿`]);

const idb: Tables = {
  get: async (table, key) =>
    (await done((await store('readonly')).get([table, key]))) as string | undefined,
  put: async (table, key, value) =>
    void (await done((await store('readwrite')).put(value, [table, key]))),
  delete: async (table, key) => void (await done((await store('readwrite')).delete([table, key]))),
  async all(table, prefix = '') {
    const s = await store('readonly');
    const [keys, values] = await Promise.all([
      done(s.getAllKeys(range(table, prefix))),
      done(s.getAll(range(table, prefix))),
    ]);
    return keys.map((k, i) => ({ key: (k as [Table, string])[1], value: values[i] as string }));
  },
  deletePrefix: async (table, prefix) =>
    void (await done((await store('readwrite')).delete(range(table, prefix)))),
};

/** Reads and single writes, outside a transaction. */
export const tables = async (): Promise<Tables> => idb;

type Op =
  | { kind: 'put'; table: Table; key: string; value: string }
  | { kind: 'delete'; table: Table; key: string }
  | { kind: 'deletePrefix'; table: Table; prefix: string };

/** A row's value after the buffered writes, in order. */
function replay(ops: Op[], table: Table, key: string, value: string | undefined) {
  for (const op of ops) {
    if (op.table !== table) continue;
    if (op.kind === 'put' && op.key === key) value = op.value;
    else if (op.kind === 'delete' && op.key === key) value = undefined;
    else if (op.kind === 'deletePrefix' && key.startsWith(op.prefix)) value = undefined;
  }
  return value;
}

/**
 * Runs `task` with its writes committed together or not at all (DC2). An IndexedDB transaction
 * closes at the first await on anything else, so the writes are buffered (reads see them) and
 * committed in one transaction once `task` resolves; a throw commits nothing.
 */
export async function transaction<T>(task: (tx: Tables) => Promise<T>): Promise<T> {
  const ops: Op[] = [];
  const view: Tables = {
    get: async (table, key) => replay(ops, table, key, await idb.get(table, key)),
    put: async (table, key, value) => void ops.push({ kind: 'put', table, key, value }),
    delete: async (table, key) => void ops.push({ kind: 'delete', table, key }),
    async all(table, prefix = '') {
      const base = new Map((await idb.all(table, prefix)).map((r) => [r.key, r.value]));
      const keys = new Set(base.keys());
      for (const op of ops)
        if (op.kind === 'put' && op.table === table && op.key.startsWith(prefix)) keys.add(op.key);
      return [...keys]
        .sort()
        .map((key) => ({ key, value: replay(ops, table, key, base.get(key)) }))
        .filter((r): r is { key: string; value: string } => r.value !== undefined);
    },
    deletePrefix: async (table, prefix) => void ops.push({ kind: 'deletePrefix', table, prefix }),
  };
  const result = await task(view);
  if (!ops.length) return result;
  const tx = (await db()).transaction(STORE, 'readwrite');
  const s = tx.objectStore(STORE);
  for (const op of ops) {
    if (op.kind === 'put') s.put(op.value, [op.table, op.key]);
    else if (op.kind === 'delete') s.delete([op.table, op.key]);
    else s.delete(range(op.table, op.prefix));
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // A full origin quota reads as the phone's full disk (mutate shows "storage full").
    tx.onerror = tx.onabort = () =>
      reject(
        tx.error?.name === 'QuotaExceededError'
          ? new Error('offline-queue-storage-full')
          : tx.error,
      );
  });
  return result;
}

/** The web keeps the cache and the outbox too (the PWA's offline mode). */
export const offlineStorage = true;
