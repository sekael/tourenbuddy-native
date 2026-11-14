import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { InvalidPhoneNumberError, PhoneAlreadyRegisteredError } from '@/core/exceptions';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { mutate } from '@/core/offline/mutate';
import { flushThenRefetch, PermanentReplayError, registerReplay } from '@/core/offline/replay';
import type { WriteQueueEntry } from '@/core/offline/write-queue';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import { supabase } from '@/core/supabase';
import { normalizePhone } from '@/core/utils/phone-normalize';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { UserProfileRepositoryImpl } from '@/features/user/data/repositories/user-profile-repository-impl';
import type { UserProfile } from '@/features/user/domain/entities/user-profile';

/**
 * The signed-in user's profile (user-profile), ported from the PWA's store: hydrate from the
 * cache, create the row on first load, every edit through `mutate()` (queued offline, last write
 * wins on replay), phone verification through auth, account deletion through the Worker. The app's
 * language follows the device (iOS sets it per app in Settings), so the profile's `locale` is only
 * seeded for the server's emails, never read to switch the app.
 */
const log = createLogger('UserProfileStore');
const repository = new UserProfileRepositoryImpl();

type State = {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  /** The name step was skipped for this launch. */
  sessionSkipped: boolean;
  start: () => void;
  clear: () => void;
  loadProfile: () => Promise<void>;
  updateProfile: (fields: Partial<Omit<UserProfile, 'id'>>) => Promise<unknown>;
  setLocale: (code: string) => Promise<void>;
  checkPhoneAvailability: (phone: string) => Promise<void>;
  sendPhoneVerification: (phone: string) => Promise<void>;
  verifyPhone: (phone: string, token: string) => Promise<void>;
  deletePhone: () => Promise<unknown>;
  /** Deletes the account (online only). True on success; the caller signs out. */
  deleteAccount: () => Promise<boolean>;
  skipOnboarding: () => void;
  dismissTourAtSignIn: () => Promise<void>;
  saveTourStep: (n: number) => Promise<void>;
  dismissCalendarTour: () => Promise<void>;
};

const uid = () => sessionUser.getState().id;
let unsubscribe: (() => void) | null = null;

registerReplay('profile', async (entry: WriteQueueEntry) => {
  const desired = entry.payload as UserProfile;
  const serverTs = await repository.getProfileUpdatedAt(entry.entityId);
  if (serverTs === null) throw new PermanentReplayError('profile row is gone');
  if (entry.baseUpdatedAt && new Date(serverTs) > new Date(entry.baseUpdatedAt)) {
    throw new PermanentReplayError('profile changed on the server since this edit (LWW loser)');
  }
  await repository.upsertProfile(desired);
});

function e164(phone: string): string {
  const result = normalizePhone(phone);
  if (!result.ok) throw new InvalidPhoneNumberError();
  return result.e164;
}

export const useUserProfileStore = create<State>()((set, get) => {
  /** Writes straight through (online), for the onboarding flags that need no queue. */
  async function persist(fields: Partial<Omit<UserProfile, 'id'>>) {
    const me = uid();
    const current = get().profile;
    if (!me || !current) return;
    const updated = await repository.upsertProfile({ ...current, ...fields, id: me });
    if (uid() === me) set({ profile: updated });
  }

  return {
    profile: null,
    isLoading: false,
    error: null,
    sessionSkipped: false,

    start: () => {
      const me = uid();
      if (!me || unsubscribe) return;
      unsubscribe = subscribeRealtime({
        topic: `user-profile:${me}`,
        postgres: [{ event: '*', table: 'user_profile', filter: `id=eq.${me}` }],
        onChange: () => void get().loadProfile(),
        onSubscribed: () => void flushThenRefetch(get().loadProfile),
      });
      void get().loadProfile();
    },

    clear: () => {
      unsubscribe?.();
      unsubscribe = null;
      set({ profile: null, error: null, isLoading: false, sessionSkipped: false });
    },

    loadProfile: async () => {
      const me = uid();
      if (!me) return;
      set({ isLoading: true, error: null });
      try {
        await cachedLoad<UserProfile[]>(
          `profile:${me}`,
          async () => {
            const existing = await repository.getUserById(me);
            return [
              existing ??
                (await repository.upsertProfile({
                  id: me,
                  firstName: null,
                  lastName: null,
                  locale: null,
                  onboardingTourShowAtSignIn: true,
                  onboardingTourLastStep: 0,
                  calendarTourShowOnFirstOpen: true,
                  calendarFeatureNoticeShowAtSignIn: false,
                  pace: 1,
                  updatedAt: null,
                })),
            ];
          },
          (rows) => {
            if (uid() === me) set({ profile: rows[0] ?? null });
          },
        );
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Failed to load profile' });
        log.error('Failed to load user profile', err);
      } finally {
        set({ isLoading: false });
      }
    },

    updateProfile: async (fields) => {
      const me = uid();
      const current = get().profile;
      if (!me || !current) return;
      const desired = { ...current, ...fields, id: me };
      return mutate<UserProfile>({
        run: async () => {
          const updated = await repository.upsertProfile(desired);
          if (uid() === me) set({ profile: updated });
        },
        intent: {
          entityId: me,
          kind: 'profile',
          op: 'update',
          payload: desired,
          baseSnapshot: current,
          baseUpdatedAt: current.updatedAt ?? undefined,
        },
        cacheKey: `profile:${me}`,
        current: [current],
        apply: () => [desired],
        assign: (rows) => set({ profile: rows[0] ?? null }),
      });
    },

    setLocale: async (code) => {
      const current = get().profile;
      if (!current || current.locale === code) return;
      await get()
        .updateProfile({ locale: code as UserProfile['locale'] })
        .catch(() => {});
    },

    checkPhoneAvailability: async (phone) => {
      const { data: taken } = await supabase.rpc('is_phone_registered', { p_phone: e164(phone) });
      if (taken) throw new PhoneAlreadyRegisteredError();
    },

    sendPhoneVerification: async (phone) => {
      const { error } = await supabase.auth.updateUser({ phone: e164(phone) });
      if (error) {
        if (/already|exists|registered|in use/i.test(error.message)) {
          throw new PhoneAlreadyRegisteredError();
        }
        throw new Error(error.message);
      }
    },

    verifyPhone: async (phone, token) => {
      const result = normalizePhone(phone);
      const { error } = await supabase.auth.verifyOtp({
        phone: result.ok ? result.e164 : phone,
        token,
        type: 'phone_change',
      });
      if (error) throw new Error(error.message);
      await useAuthStore.getState().refreshUser();
    },

    deletePhone: () =>
      mutate(async () => {
        set({ error: null });
        const { error } = await supabase.rpc('delete_own_phone');
        if (error) {
          set({ error: error.message });
          throw new Error(error.message);
        }
        await useAuthStore.getState().refreshUser();
      }),

    deleteAccount: async () => {
      set({ error: null });
      try {
        await repository.deleteAccount();
        return true;
      } catch (err) {
        log.error('Account deletion failed', err);
        set({ error: (err as Error).message });
        return false;
      }
    },

    skipOnboarding: () => set({ sessionSkipped: true }),
    dismissTourAtSignIn: () =>
      persist({ onboardingTourShowAtSignIn: false }).catch((e) =>
        log.error('Failed to dismiss the guided tour at sign-in', e),
      ),
    saveTourStep: (n) =>
      persist({ onboardingTourLastStep: n }).catch((e) =>
        log.error('Failed to persist the guided tour step', e),
      ),
    dismissCalendarTour: () =>
      persist({ calendarTourShowOnFirstOpen: false }).catch((e) =>
        log.error('Failed to dismiss the calendar tour', e),
      ),
  };
});

/** The user's pace factor (0.5–1.5) for estimated times; 1 until the profile loads. */
export const usePace = () => useUserProfileStore((s) => s.profile?.pace ?? 1);
