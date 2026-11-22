import { sessionUser } from '@/core/auth/session-user';
import { createLogger } from '@/core/logging/logger';

import { resetCachedLoad } from './cached-load';
import { clearUserCache } from './entity-cache';
import { clearFileCache } from './file-cache';

const log = createLogger('OfflineSession');

/**
 * When the signed-in user changes (sign-out, or another account), the previous user's snapshots and
 * downloaded files are deleted (offline-data-cache), so nothing of theirs can show for the next one.
 * Their queued writes stay, tagged with their id, and replay at their next sign-in on this device.
 */
sessionUser.subscribe((state, previous) => {
  if (!previous.id || previous.id === state.id) return;
  resetCachedLoad();
  try {
    clearFileCache();
  } catch (error) {
    log.warn('Could not delete cached files', error);
  }
  void clearUserCache(previous.id).catch((error) =>
    log.warn('Could not delete cached data', error),
  );
});
