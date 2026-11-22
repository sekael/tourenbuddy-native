import type { Table, Tables } from '@/core/offline/tables';

/**
 * Stands in for `@/core/offline/tables` in every test (`test/setup.ts`): the offline database as
 * Maps, with real transaction semantics (a task that throws leaves nothing behind) and a switch to
 * make the next transaction fail after its writes, to prove atomicity.
 */
type Data = Record<Table, Map<string, string>>;

const fresh = (): Data => ({ cache: new Map(), queue: new Map(), dead: new Map() });
let data = fresh();

export const fakeTables = {
  reset() {
    data = fresh();
    fakeTables.failNextCommit = false;
  },
  /** The next transaction throws after its task ran, as a failing commit would. */
  failNextCommit: false,
  dump: (table: Table) => new Map(data[table]),
};

function on(store: Data): Tables {
  return {
    get: async (table, key) => store[table].get(key),
    put: async (table, key, value) => void store[table].set(key, value),
    delete: async (table, key) => void store[table].delete(key),
    all: async (table, prefix = '') =>
      [...store[table]]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({ key, value })),
    deletePrefix: async (table, prefix) => {
      for (const key of [...store[table].keys()])
        if (key.startsWith(prefix)) store[table].delete(key);
    },
  };
}

export const tables = async (): Promise<Tables> => on(data);

export async function transaction<T>(task: (tx: Tables) => Promise<T>): Promise<T> {
  const copy: Data = {
    cache: new Map(data.cache),
    queue: new Map(data.queue),
    dead: new Map(data.dead),
  };
  const result = await task(on(copy));
  if (fakeTables.failNextCommit) {
    fakeTables.failNextCommit = false;
    throw new Error('commit failed');
  }
  data = copy;
  return result;
}

export const offlineStorage = true;
