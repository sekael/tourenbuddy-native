import { Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { createStore } from 'zustand/vanilla';

import { sessionTrust } from '@/core/auth/session-trust';

/**
 * One reachability signal for stores and UI (offline-data-cache "Reachability from the operating
 * system"). From the OS network state: connected and not known to be cut off from the internet.
 * `isInternetReachable` is `null` until the OS has probed; unknown counts as reachable, so a fresh
 * launch never blocks on the probe (a failed request still falls back to the cache).
 */
export const connectivity = createStore(() => ({ online: true }));

function apply(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  const online = state.isConnected !== false && state.isInternetReachable !== false;
  if (online !== connectivity.getState().online) connectivity.setState({ online });
}

NetInfo.addEventListener(apply);
void NetInfo.fetch().then(apply);

// Where the browser has `navigator.connection` (Chrome), NetInfo listens only to its changes, which
// do not report losing the network; the window's own events do.
if (Platform.OS === 'web') {
  // Read at once: NetInfo's fetch waits on its reachability probe.
  const refresh = () => apply({ isConnected: navigator.onLine, isInternetReachable: null });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
}

/** The device has internet, as far as the OS knows. */
export const isOnline = (): boolean => connectivity.getState().online;

/**
 * The backend can be used now: online AND the session is verified. An unverified session's requests
 * queue behind auth-js's refresh retries instead of failing fast, so they count as offline.
 */
export const isReachable = (): boolean => isOnline() && !sessionTrust.getState().unverified;
