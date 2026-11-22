import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { createLogger } from '@/core/logging/logger';
import { getCached, putCached } from '@/core/offline/entity-cache';
import { replayQueue } from '@/core/offline/replay';

import { acceptTerms, fetchTermsStatus } from '../../data/terms-repository';
import { TERMS_VERSION, termsGate, type TermsGate, type TermsStatus } from '../../domain/terms';

const log = createLogger('Terms');
const TIMEOUT_MS = 5000;
const UNAVAILABLE_RECHECK_MS = 2 * 60 * 1000;

type TermsState = {
  /** `loading` until the first answer (the cache's or the server's). */
  gate: TermsGate | 'loading';
  /** Nothing confirmed and the server unreachable: accepting needs a connection. */
  offline: boolean;
  /** The version in force, once known (About pages: "takes effect on"). */
  inForce: string | null;
  accepting: boolean;
  /** The last accept failed (not offline): say so and let them retry. */
  failed: boolean;
  check: () => Promise<void>;
  accept: () => Promise<void>;
  clear: () => void;
};

const cacheKey = (uid: string) => `terms:${uid}`;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ]);
}

const fromStatus = (status: TermsStatus) => ({
  gate: termsGate(TERMS_VERSION, status),
  inForce: status.current,
});

/**
 * The terms gate (terms-acceptance): whether the signed-in user may use the app. The last confirmed
 * status is kept per user, so an accepted user is never locked out offline, and the server's answer
 * replaces it as soon as it arrives.
 */
export const useTermsStore = create<TermsState>()((set, get) => ({
  gate: 'loading',
  offline: false,
  inForce: null,
  accepting: false,
  failed: false,

  check: async () => {
    const uid = sessionUser.getState().id;
    if (!uid) return;
    if (get().gate === 'loading') {
      const cached = await getCached<TermsStatus>(cacheKey(uid)).catch(() => undefined);
      if (cached && sessionUser.getState().id === uid && get().gate === 'loading')
        set(fromStatus(cached));
    }
    try {
      const status = await withTimeout(fetchTermsStatus());
      if (sessionUser.getState().id !== uid) return;
      await putCached(cacheKey(uid), status).catch(() => {});
      set({ ...fromStatus(status), offline: false });
    } catch (error) {
      log.warn('Terms status unavailable', error);
      if (sessionUser.getState().id !== uid) return;
      // Keep what the cache said; with nothing confirmed, ask for the acceptance once online.
      set((s) => (s.gate === 'loading' ? { gate: 'accept', offline: true } : { offline: true }));
    }
  },

  accept: async () => {
    const uid = sessionUser.getState().id;
    if (!uid || get().accepting) return;
    set({ accepting: true, failed: false });
    try {
      const status = await acceptTerms(TERMS_VERSION);
      await putCached(cacheKey(uid), status).catch(() => {});
      set({ ...fromStatus(status), accepting: false, offline: false });
      // Edits saved offline before the acceptance go out now.
      if (get().gate === 'pass') void replayQueue().catch(() => {});
    } catch (error) {
      log.warn('Accepting the terms failed', error);
      set({ accepting: false, failed: true });
      // The version in force may have moved on: the next answer shows the right page.
      await get().check();
    }
  },

  clear: () =>
    set({ gate: 'loading', offline: false, inForce: null, accepting: false, failed: false }),
}));

/** The bundled terms' date while an older version is still in force (About pages), else null. */
export function useTermsEffective(): string | null {
  const inForce = useTermsStore((s) => s.inForce);
  return inForce && TERMS_VERSION > inForce ? TERMS_VERSION : null;
}

/**
 * Checks the gate for the signed-in user: at sign-in, on every return to the foreground, and every
 * two minutes while the terms are not available yet. Signed out, it forgets the last answer.
 */
export function useTermsGate(userId: string | null): TermsGate | 'loading' {
  const gate = useTermsStore((s) => s.gate);

  useEffect(() => {
    const { check, clear } = useTermsStore.getState();
    if (!userId) {
      clear();
      return;
    }
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [userId]);

  useEffect(() => {
    if (gate !== 'unavailable') return;
    const timer = setInterval(() => void useTermsStore.getState().check(), UNAVAILABLE_RECHECK_MS);
    return () => clearInterval(timer);
  }, [gate]);

  return gate;
}
