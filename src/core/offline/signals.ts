import { createStore } from 'zustand/vanilla';

import type { WriteQueueEntry } from './write-queue';

/**
 * What the offline layer tells the UI: a write refused offline (`offlineBlockedAt`), a write queued
 * offline (`savedOfflineAt`), a queue failure (`offlineWriteError`, an i18n key), and the outbox's
 * state for the banner and the review list.
 */
export const offlineSignals = createStore(() => ({
  offlineBlockedAt: 0,
  savedOfflineAt: 0,
  offlineWriteError: null as string | null,
  pendingCount: 0,
  deadLetters: [] as WriteQueueEntry[],
  drainedAt: 0,
}));
