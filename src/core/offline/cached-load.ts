import { getCached, putCached } from './entity-cache';
import { isReachable } from './online';

// Keys already served a fresh network result this session: a warm reload skips the cache paint,
// which would only flicker the UI back to an older snapshot before the network result lands.
const seenFresh = new Set<string>();

/**
 * Hydrate, then refetch (offline-data-cache "Loads hydrate, then refetch when reachable"), ported
 * from the PWA. The request starts at once when reachable and runs beside the cache read; the cache
 * paints first on a cold load or offline; offline (or on an unverified session) no request is made
 * and the snapshot stands. A failed fetch keeps the painted snapshot and rethrows, so the store's
 * `error` records it. The cache is best effort: its failures never fail a load.
 */
export async function cachedLoad<T>(
  key: string,
  fetcher: () => Promise<T>,
  assign: (value: T) => void,
): Promise<void> {
  const fresh = isReachable() ? fetcher() : undefined;
  void fresh?.catch(() => {});

  if (fresh === undefined || !seenFresh.has(key)) {
    const cached = await getCached<T>(key).catch(() => undefined);
    if (cached !== undefined) assign(cached);
  }

  if (fresh === undefined) return;

  const result = await fresh;
  assign(result);
  seenFresh.add(key);
  await putCached(key, result).catch(() => {});
}

/** Test seam, and sign-out: the next load paints the cache again. */
export function resetCachedLoad(): void {
  seenFresh.clear();
}
