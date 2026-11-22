import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

/**
 * The app's offline database (D9): one SQLite file, one key-value table split by `tbl`. Everything
 * the offline layer stores is a JSON string under a key; the modules above it (entity cache, write
 * queue) decide what. Keeping this layer this small keeps the SQL in one place and lets tests swap
 * it for an in-memory fake (`test/support/fake-tables.ts`).
 *
 * - `cache`: last good snapshot per collection and user (`<collection>:<uid>`), plus small markers.
 * - `queue`: the outbox, one row per entity (`entityId`).
 * - `dead`: entries replay gave up on, for review.
 */
export type Table = 'cache' | 'queue' | 'dead';

export type Tables = {
  get(table: Table, key: string): Promise<string | undefined>;
  put(table: Table, key: string, value: string): Promise<void>;
  delete(table: Table, key: string): Promise<void>;
  /** Every row of a table, or those whose key starts with `prefix`. */
  all(table: Table, prefix?: string): Promise<{ key: string; value: string }[]>;
  deletePrefix(table: Table, prefix: string): Promise<void>;
};

let opening: Promise<SQLiteDatabase> | undefined;

function db(): Promise<SQLiteDatabase> {
  opening ??= openDatabaseAsync('tourenbuddy.db').then(async (handle) => {
    await handle.execAsync(
      `PRAGMA journal_mode = WAL;
       CREATE TABLE IF NOT EXISTS kv (
         tbl TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (tbl, key)
       );`,
    );
    return handle;
  });
  return opening;
}

type Runner = Pick<SQLiteDatabase, 'getFirstAsync' | 'getAllAsync' | 'runAsync'>;

function tablesOn(runner: Runner): Tables {
  return {
    async get(table, key) {
      const row = await runner.getFirstAsync<{ value: string }>(
        'SELECT value FROM kv WHERE tbl = ? AND key = ?',
        [table, key],
      );
      return row?.value;
    },
    async put(table, key, value) {
      await runner.runAsync('INSERT OR REPLACE INTO kv (tbl, key, value) VALUES (?, ?, ?)', [
        table,
        key,
        value,
      ]);
    },
    async delete(table, key) {
      await runner.runAsync('DELETE FROM kv WHERE tbl = ? AND key = ?', [table, key]);
    },
    async all(table, prefix = '') {
      return runner.getAllAsync<{ key: string; value: string }>(
        'SELECT key, value FROM kv WHERE tbl = ? AND substr(key, 1, length(?)) = ? ORDER BY key',
        [table, prefix, prefix],
      );
    },
    async deletePrefix(table, prefix) {
      await runner.runAsync('DELETE FROM kv WHERE tbl = ? AND substr(key, 1, length(?)) = ?', [
        table,
        prefix,
        prefix,
      ]);
    },
  };
}

/** Reads and single writes, outside a transaction. */
export async function tables(): Promise<Tables> {
  return tablesOn(await db());
}

/**
 * Runs `task` in one exclusive transaction: everything it writes commits together or not at all
 * (DC2: the cache write-through and the queue entry of an offline mutation).
 */
export async function transaction<T>(task: (tx: Tables) => Promise<T>): Promise<T> {
  const handle = await db();
  let result: T | undefined;
  await handle.withExclusiveTransactionAsync(async (txn) => {
    result = await task(tablesOn(txn));
  });
  return result as T;
}

/** The offline database exists on iOS and Android only (D8: the web is online-only). */
export const offlineStorage = true;
