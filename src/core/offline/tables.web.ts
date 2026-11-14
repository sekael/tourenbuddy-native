import type { Tables } from './tables';

export type { Table, Tables } from './tables';

/**
 * The web keeps nothing for offline use (#346 D8): reads find nothing, writes are dropped, and
 * `offlineStorage` tells `mutate()` to fail an offline write instead of queueing it.
 */
const none: Tables = {
  get: async () => undefined,
  put: async () => {},
  delete: async () => {},
  all: async () => [],
  deletePrefix: async () => {},
};

export const tables = async (): Promise<Tables> => none;
export const transaction = <T>(task: (tx: Tables) => Promise<T>): Promise<T> => task(none);
export const offlineStorage = false;
