import { Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { createStore } from 'zustand/vanilla';

import { sessionTrust } from '@/core/auth/session-trust';
import { env } from '@/core/env';

/**
 * One reachability signal for stores and UI (offline-data-cache "Reachability from the operating
 * system"). From the OS network state: connected and not known to be cut off from the internet.
 * `isInternetReachable` is `null` until the OS has probed; unknown counts as reachable, so a fresh
 * launch never blocks on the probe (a failed request still falls back to the cache).
 */
export const connectivity = createStore(() => ({ online: true }));

/** While the OS says offline, how often the backend is asked whether it answers after all. */
export const RECHECK_MS = 5000;

let osOnline = true;
/** The last probe's answer while the OS says offline; null once the OS changes its mind. */
let probed: boolean | null = null;
let recheck: ReturnType<typeof setTimeout> | null = null;

function publish() {
  const online = osOnline || probed === true;
  if (online !== connectivity.getState().online) connectivity.setState({ online });
}

/**
 * Any answer from the backend, even an error status, means the way there is open. Opaque on the
 * web (no CORS needed). ponytail: no timeout, a black-holed request waits for the system's (60 s);
 * add an AbortController if recovery on such a network ever lags.
 */
async function probe(): Promise<boolean> {
  try {
    await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * The PWA's re-probe (use-online-status.ts): the OS does not always report the network coming back
 * (the iOS Simulator never does), so while it says offline, the backend is asked every few seconds,
 * both ways: an answer counts as online, the next failure as offline again. Stops once the OS says
 * online, as the OS and the backend then agree.
 */
function scheduleProbe() {
  recheck ??= setTimeout(async () => {
    const reachable = await probe();
    recheck = null;
    if (osOnline) return;
    probed = reachable;
    publish();
    scheduleProbe();
  }, RECHECK_MS);
}

function apply(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  const os = state.isConnected !== false && state.isInternetReachable !== false;
  // A change of the OS's verdict outranks the last probe.
  if (os !== osOnline) probed = null;
  osOnline = os;
  publish();
  if (!os) scheduleProbe();
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

/** The device has internet, as far as the OS (or, while it says offline, the backend) knows. */
export const isOnline = (): boolean => connectivity.getState().online;

/**
 * The backend can be used now: online AND the session is verified. An unverified session's requests
 * queue behind auth-js's refresh retries instead of failing fast, so they count as offline.
 */
export const isReachable = (): boolean => isOnline() && !sessionTrust.getState().unverified;
