import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { createLogger } from '@/core/logging/logger';

const log = createLogger('FileCache');

/**
 * Offline-first bytes for files that never change once written (a GPX key is minted per upload,
 * an attachment path carries its own id), kept in the app's documents so iOS does not purge them
 * like the cache. The PWA kept them in IndexedDB (`blob-cache.ts`). Web: no offline storage (D8),
 * every read goes to the network.
 */
const native = Platform.OS !== 'web';
const root = native ? new Directory(Paths.document, 'files') : null;
/** Files picked offline, waiting for their upload on replay; never cleared on sign-out. */
const staged = native ? new Directory(Paths.document, 'staged') : null;

function fileIn(dir: Directory | null, key: string): File | null {
  if (!dir) return null;
  if (!dir.exists) dir.create({ intermediates: true });
  // Keys are storage paths (`<uid>/<id>.gpx`): flattened, so one directory holds them all.
  return new File(dir, key.replace(/[^a-zA-Z0-9._-]/g, '_'));
}

const fileFor = (key: string) => {
  const waiting = fileIn(staged, key);
  return waiting?.exists ? waiting : fileIn(root, key);
};

/** The cached text for `key`, else `fetch()`'s (stored for next time); undefined if neither works. */
export async function loadCachedText(
  key: string,
  fetchText: () => Promise<string>,
): Promise<string | undefined> {
  const file = fileFor(key);
  if (file?.exists) return file.text();
  try {
    const text = await fetchText();
    if (file) {
      try {
        file.create({ overwrite: true });
        file.write(text);
      } catch (error) {
        log.warn('Could not cache', key, error);
      }
    }
    return text;
  } catch (error) {
    log.info('Not cached and not reachable', key, error);
    return undefined;
  }
}

/**
 * A local copy of the file at `key`, cache-first: the cached file when present (no request at all),
 * else downloaded from `fetchUrl()` into the cache. Undefined when neither works (offline, never
 * cached). Native only.
 */
export async function loadCachedFile(
  key: string,
  fetchUrl: () => Promise<string>,
): Promise<string | undefined> {
  const file = fileFor(key);
  if (!file) return undefined;
  if (file.exists) return file.uri;
  try {
    const downloaded = await File.downloadFileAsync(await fetchUrl(), file, { idempotent: true });
    return downloaded.uri;
  } catch (error) {
    log.info('Not cached and not reachable', key, error);
    return undefined;
  }
}

/** Copies a picked file into the cache under `key`, so it shows at once and offline (D2). */
export function cacheLocalFile(key: string, uri: string): void {
  const file = fileIn(root, key);
  if (!file) return;
  try {
    if (file.exists) file.delete();
    new File(uri).copy(file);
  } catch (error) {
    log.warn('Could not cache', key, error);
  }
}

/** Forgets one cached file (a cancelled or deleted attachment). */
export function evictCachedFile(key: string): void {
  const file = fileIn(root, key);
  if (file?.exists) file.delete();
}

/** Stores text under `key` before it exists remotely (a GPX picked offline, replayed later). */
export function stageFileText(key: string, text: string): void {
  const file = fileIn(staged, key);
  if (!file) return;
  file.create({ overwrite: true });
  file.write(text);
}

/** The upload landed: the staged copy becomes an ordinary cached one. */
export function unstageFile(key: string): void {
  const from = fileIn(staged, key);
  const to = fileIn(root, key);
  if (!from?.exists || !to) return;
  if (to.exists) to.delete();
  from.move(to);
}

/** The local URI of a cached file, if any (for the system preview). */
export function cachedUri(key: string): string | undefined {
  const file = fileFor(key);
  return file?.exists ? file.uri : undefined;
}

/**
 * Forget every downloaded file (sign-out: the next user must not read them). Staged files stay:
 * they belong to queued writes, which replay only for their own user.
 */
export function clearFileCache(): void {
  if (root?.exists) root.delete();
}
