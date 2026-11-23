import { createLogger } from '@/core/logging/logger';

const log = createLogger('FileCache');

/**
 * The web's file cache (the PWA's `blob-cache.ts`): bytes of files that never change once written
 * (a GPX key is minted per upload, an attachment path carries its own id) in IndexedDB, keyed by
 * storage path, so they show at once and offline. Staged files (picked offline, uploaded on
 * replay) sit under `staged:`, never cleared on sign-out. `cachedUri` must answer synchronously,
 * so every blob read or written this session also keeps an object URL in memory; staged blobs are
 * loaded into it at start, for the replay.
 */
const DB = 'tourenbuddy-files';
const STORE = 'blobs';
const STAGED = 'staged:';

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

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise<T>((resolve, reject) => {
    const request = op(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const get = (key: string) => run<Blob | undefined>('readonly', (s) => s.get(key));
const put = (key: string, blob: Blob) => run('readwrite', (s) => s.put(blob, key));
const del = (key: string) => run('readwrite', (s) => s.delete(key));

/** Object URLs for the blobs this session has seen, by cache key (`staged:` included). */
const urls = new Map<string, string>();
function remember(key: string, blob: Blob): string {
  const known = urls.get(key);
  if (known) URL.revokeObjectURL(known);
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}
function forget(key: string) {
  const known = urls.get(key);
  if (known) URL.revokeObjectURL(known);
  urls.delete(key);
}

/** The staged copy wins over the cached one (it is what the replay uploads). */
async function cached(key: string): Promise<Blob | undefined> {
  try {
    return (await get(STAGED + key)) ?? (await get(key));
  } catch (error) {
    log.warn('Cache unreadable', key, error);
    return undefined;
  }
}

// Staged files outlive a reload: their object URLs come back for the replay.
if (typeof indexedDB !== 'undefined')
  void run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    .then(async (keys) => {
      for (const key of keys.map(String).filter((k) => k.startsWith(STAGED))) {
        const blob = await get(key);
        if (blob) remember(key, blob);
      }
    })
    .catch((error) => log.warn('Could not load staged files', error));

/** The cached text for `key`, else `fetch()`'s (stored for next time); undefined if neither works. */
export async function loadCachedText(
  key: string,
  fetchText: () => Promise<string>,
): Promise<string | undefined> {
  const blob = await cached(key);
  if (blob) return blob.text();
  try {
    const text = await fetchText();
    void put(key, new Blob([text])).catch((error) => log.warn('Could not cache', key, error));
    return text;
  } catch (error) {
    log.info('Not cached and not reachable', key, error);
    return undefined;
  }
}

/**
 * An object URL for the file at `key`, cache-first: the cached bytes when present (no request at
 * all), else downloaded from `fetchUrl()` into the cache. Undefined when neither works.
 */
export async function loadCachedFile(
  key: string,
  fetchUrl: () => Promise<string>,
): Promise<string | undefined> {
  const hit = await cached(key);
  if (hit) return URL.createObjectURL(hit);
  try {
    const response = await fetch(await fetchUrl());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    void put(key, blob).catch((error) => log.warn('Could not cache', key, error));
    return URL.createObjectURL(blob);
  } catch (error) {
    log.info('Not cached and not reachable', key, error);
    return undefined;
  }
}

/** Copies a picked file (its blob URL) into the cache under `key`, so it shows at once and offline. */
export function cacheLocalFile(key: string, uri: string): void {
  void fetch(uri)
    .then((r) => r.blob())
    .then((blob) => {
      remember(key, blob);
      return put(key, blob);
    })
    .catch((error) => log.warn('Could not cache', key, error));
}

/** Forgets one cached file (a cancelled or deleted attachment). */
export function evictCachedFile(key: string): void {
  forget(key);
  void del(key).catch(() => {});
}

/** Stores text under `key` before it exists remotely (a GPX picked offline, replayed later). */
export function stageFileText(key: string, text: string): void {
  const blob = new Blob([text], { type: 'application/gpx+xml' });
  remember(STAGED + key, blob);
  void put(STAGED + key, blob).catch((error) => log.warn('Could not stage', key, error));
}

/** Drops a staged file without uploading it (a draft's offline GPX, discarded). */
export function dropStagedFile(key: string): void {
  forget(STAGED + key);
  void del(STAGED + key).catch(() => {});
}

/** The upload landed: the staged copy becomes an ordinary cached one. */
export function unstageFile(key: string): void {
  const url = urls.get(STAGED + key);
  if (url) {
    urls.delete(STAGED + key);
    urls.set(key, url);
  }
  void get(STAGED + key)
    .then(async (blob) => {
      if (blob) await put(key, blob);
      await del(STAGED + key);
    })
    .catch((error) => log.warn('Could not unstage', key, error));
}

/** The object URL of a file seen this session, if any (staged first). */
export function cachedUri(key: string): string | undefined {
  return urls.get(STAGED + key) ?? urls.get(key);
}

/** Forget every downloaded file (sign-out); staged files stay for their user's replay. */
export function clearFileCache(): void {
  for (const key of [...urls.keys()]) if (!key.startsWith(STAGED)) forget(key);
  void run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    .then((keys) =>
      Promise.all(
        keys
          .map(String)
          .filter((k) => !k.startsWith(STAGED))
          .map((k) => del(k)),
      ),
    )
    .catch((error) => log.warn('Could not clear', error));
}
