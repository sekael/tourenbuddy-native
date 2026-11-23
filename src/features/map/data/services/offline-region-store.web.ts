// Ported from the PWA's features/map/data/services/offline-region-store.ts (port-pwa-web): MapLibre GL JS on the web.
import { createLogger } from '@/core/logging/logger';

/**
 * Metadata index of downloaded offline base-map regions. The tile bytes live in
 * the `offline-map-tiles` Cache; this IndexedDB store is only the ledger the
 * manage UI lists from and that delete/orphan-sweep derive URL sets from.
 *
 * We deliberately do NOT persist the per-tile URL list (a whole-Switzerland
 * region is ~74k URLs). The `bbox` + zoom range recompute the URL set on demand
 * via `enumerateTiles`, which is cheap and keeps records tiny.
 */
export interface OfflineRegion {
  id: string;
  label: string;
  /** WGS84 [west, south, east, north]. */
  bbox: [number, number, number, number];
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  bytes: number;
  createdAt: number;
}

const logger = createLogger('OfflineRegions');
const DB_NAME = 'tourenbuddy-offline';
const DB_VERSION = 1;
const STORE = 'offline-regions';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    return await promisify(fn(tx.objectStore(STORE)));
  } finally {
    db.close();
  }
}

export function putRegion(region: OfflineRegion): Promise<IDBValidKey> {
  logger.debug('put region', region.id);
  return withStore('readwrite', (store) => store.put(region));
}

export function getAllRegions(): Promise<OfflineRegion[]> {
  return withStore('readonly', (store) => store.getAll() as IDBRequest<OfflineRegion[]>);
}

export function getRegion(id: string): Promise<OfflineRegion | undefined> {
  return withStore('readonly', (store) => store.get(id) as IDBRequest<OfflineRegion | undefined>);
}

export function deleteRegionRecord(id: string): Promise<undefined> {
  logger.debug('delete region record', id);
  return withStore('readwrite', (store) => store.delete(id) as IDBRequest<undefined>);
}
