import { AppState } from 'react-native';

import { sessionTrust } from '@/core/auth/session-trust';
import { sessionUser } from '@/core/auth/session-user';

import { connectivity, isReachable } from './online';
import { refreshQueueStatus, replayQueue } from './replay';

let registered = false;

/**
 * Flush triggers (offline-write-sync "The outbox survives the app on native"): reachability coming
 * back, the app returning to the foreground, a session confirmed or a user signing in. Realtime's
 * `SUBSCRIBED` refetch drains first too (`flushThenRefetch`). `replayQueue` is single-flight, so
 * overlapping nudges share one drain. Registered once by the root layout.
 */
export function registerFlushTriggers(): void {
  if (registered) return;
  registered = true;

  connectivity.subscribe((state, previous) => {
    if (state.online && !previous.online) void replayQueue();
  });
  sessionTrust.subscribe((state, previous) => {
    if (previous.unverified && !state.unverified) void replayQueue();
  });
  sessionUser.subscribe((state, previous) => {
    if (state.id === previous.id) return;
    void refreshQueueStatus();
    if (state.id) void replayQueue();
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && isReachable()) void replayQueue();
  });
}
