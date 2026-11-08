import { isAuthRetryableFetchError, type User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { bounded } from '@/core/async';
import { authStorage, storageReady } from '@/core/auth/auth-storage';
import { sessionTrust } from '@/core/auth/session-trust';
import i18n from '@/core/i18n';
import { createLogger } from '@/core/logging/logger';
import { sessionKey, supabase } from '@/core/supabase';

const log = createLogger('AuthStore');

/**
 * How long session restore may hold the launch screen, and sign-out wait for auth-js.
 *
 * Offline with an expired access token, auth-js retries the refresh with backoff for 30 s before
 * it gives up, and everything that needs the session waits for that. The answer is available
 * locally in milliseconds, so the wait is capped and the retries finish in the background. Long on
 * purpose: Supabase's free tier is slow, and a launch wrongly marked unverified costs more than a
 * moment of launch screen.
 */
export const SESSION_BOUND_MS = 4000;

/**
 * The stored session's user, read without auth-js so a failed refresh does not cost the user.
 * Needs a user id (keys the offline caches) and a refresh token (proves auth-js can still revive
 * the session); anything else counts as no session.
 */
async function readStoredUser(): Promise<User | null> {
  try {
    const stored = await authStorage.getItem(sessionKey);
    const session = stored ? (JSON.parse(stored) as { user?: User; refresh_token?: string }) : null;
    return session?.user?.id && session.refresh_token ? session.user : null;
  } catch {
    return null;
  }
}

type AuthState = {
  user: User | null;
  /** Session restore has not settled yet; the launch screen stays. */
  isLoading: boolean;
  /** The running restore, so a second `initialize` joins it instead of starting another. */
  restoring?: Promise<void>;
  initialize: () => Promise<void>;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isLoading: true,

  initialize: () => {
    const running = get().restoring;
    if (running) return running;
    const restoring = (async () => {
      let user: User | null = null;
      try {
        // A prewarmed launch waits here until the user opens the app; only then does the bound run.
        await storageReady;
        const pending = supabase.auth.getSession();
        // Whatever the refresh decides later still arrives through the listener below: success as
        // TOKEN_REFRESHED, a permanent failure as SIGNED_OUT. The race only shortens the wait.
        void pending.catch(() => {});
        const result = await bounded(pending, SESSION_BOUND_MS);
        user = result === 'timeout' ? null : (result.data.session?.user ?? null);
        const retryable = result === 'timeout' || isAuthRetryableFetchError(result.error);

        // No session, but maybe only because the refresh was unreachable: the stored session is
        // intact and auth-js revives it later. Booting signed out would lock an offline user
        // behind a form that needs the network. A permanent failure (revoked, invalid) signs out.
        if (!user && retryable) {
          user = await readStoredUser();
          if (user) {
            sessionTrust.setState({ unverified: true });
            log.info('Adopted the stored session: the refresh is unreachable', { userId: user.id });
          }
        }
      } catch (error) {
        log.error('Session restore failed; starting signed out', error);
      } finally {
        set({ user, isLoading: false });
      }

      supabase.auth.onAuthStateChange((event, session) => {
        // A delivered session settles it: signed in, verified.
        if (session) {
          set({ user: session.user });
          sessionTrust.setState({ unverified: false });
        } else if (event === 'SIGNED_OUT') {
          // Only an explicit sign-out or a permanent refresh failure emits this.
          set({ user: null });
          sessionTrust.setState({ unverified: false });
        }
        // Every other empty event is transient: auth-js replays the session load to each new
        // listener, and offline that load fails again. Taking it at face value would sign out
        // the adopted session.
      });
    })();
    set({ restoring });
    return restoring;
  },

  sendEmailOtp: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // The email hook writes the mail in this language; existing users keep theirs.
      options: { data: { locale: i18n.language.split('-')[0] } },
    });
    if (error) throw error;
  },

  verifyOtp: async (email, token) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
  },

  /**
   * Shows sign-in at once and never throws: it is the one way out of an unverified session, and it
   * has to work offline. auth-js deletes the local session before it asks the server to revoke
   * it, but offline right after launch it first waits out its startup refresh (up to 30 s). So the
   * call is bounded, and the stored session is deleted here in any case, so the next launch cannot
   * adopt it.
   */
  signOut: async () => {
    set({ user: null });
    sessionTrust.setState({ unverified: false });
    const result = await bounded(
      supabase.auth.signOut({ scope: 'local' }).catch((error: unknown) => ({ error })),
      SESSION_BOUND_MS,
    );
    if (result === 'timeout' || result.error) {
      log.warn('Sign-out did not reach the server; the local session is deleted anyway');
    }
    try {
      await authStorage.removeItem(sessionKey);
    } catch (error) {
      log.error('Could not delete the stored session', error);
    }
  },
}));
