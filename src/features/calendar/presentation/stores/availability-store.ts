import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { mutate } from '@/core/offline/mutate';
import { flushThenRefetch, registerReplay } from '@/core/offline/replay';
import type { WriteQueueEntry } from '@/core/offline/write-queue';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import type { AvailabilityRow } from '@/features/calendar/data/models/availability';
import { SupabaseAvailabilityRepository } from '@/features/calendar/data/repositories/availability-repository-impl';
import { todayKey } from '@/features/calendar/domain/calendar-dates';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';

/**
 * The user's free days and their friends' (calendar-availability), ported from the PWA's store:
 * own days synced across devices, friends' days refetched when a friend's write pings the user's
 * broadcast topic or the friend set changes, and an edit that saves as one diff (online) or as
 * the whole desired set (offline, replayed against what the server holds then).
 */
const log = createLogger('AvailabilityStore');
const repository = new SupabaseAvailabilityRepository();
const uid = () => sessionUser.getState().id;

registerReplay('availability', async (entry: WriteQueueEntry) => {
  const desired = new Set(entry.payload as string[]);
  const saved = new Set(await repository.listOwnFrom(todayKey()));
  const added = [...desired].filter((day) => !saved.has(day));
  const removed = [...saved].filter((day) => !desired.has(day));
  if (added.length || removed.length) await repository.applyDiff(added, removed);
});

type AvailabilityState = {
  savedDays: Set<string>;
  workingDays: Set<string>;
  friendDays: AvailabilityRow[];
  editing: boolean;
  saving: boolean;
  error: string | null;
  start: () => void;
  clear: () => void;
  load: () => Promise<void>;
  loadFriends: () => Promise<void>;
  enterEdit: () => void;
  toggleDay: (key: string) => void;
  cancel: () => void;
  /** True when saved (or queued offline); false keeps the edit open to retry. */
  save: () => Promise<boolean>;
};

let stops: (() => void)[] = [];
let friendsSeq = 0;
let baseline = new Set<string>();

export const useAvailabilityStore = create<AvailabilityState>()((set, get) => ({
  savedDays: new Set(),
  workingDays: new Set(),
  friendDays: [],
  editing: false,
  saving: false,
  error: null,

  start: () => {
    const me = uid();
    if (!me || stops.length) return;
    stops = [
      subscribeRealtime({
        topic: `availability-${me}`,
        postgres: [{ event: '*', table: 'user_availability', filter: `user_id=eq.${me}` }],
        onChange: () => void get().load(),
        onSubscribed: () => void flushThenRefetch(get().load),
      }),
      // A friend's write pings this topic.
      subscribeRealtime({
        topic: `availability:${me}`,
        broadcast: 'refetch',
        onChange: () => void get().loadFriends(),
        onSubscribed: () => void get().loadFriends(),
      }),
      // A friend added or removed: their days come or go.
      useFriendshipsStore.subscribe((s, prev) => {
        if (s.friendUserIds !== prev.friendUserIds) void get().loadFriends();
      }),
    ];
    void get().load();
    void get().loadFriends();
  },

  clear: () => {
    stops.forEach((stop) => stop());
    stops = [];
    friendsSeq++;
    baseline = new Set();
    set({
      savedDays: new Set(),
      workingDays: new Set(),
      friendDays: [],
      editing: false,
      saving: false,
      error: null,
    });
  },

  load: async () => {
    const me = uid();
    if (!me) return;
    try {
      await cachedLoad(
        `availability:${me}`,
        () => repository.listOwnFrom(todayKey()),
        (days) => {
          if (uid() === me) set({ savedDays: new Set(days) });
        },
      );
    } catch (error) {
      log.error('Failed to load availability', error);
    }
  },

  loadFriends: async () => {
    if (!uid()) return;
    const seq = ++friendsSeq;
    try {
      const rows = await repository.listFriendsFrom(todayKey());
      if (seq === friendsSeq) set({ friendDays: rows });
    } catch (error) {
      log.error('Failed to load friend availability', error);
    }
  },

  enterEdit: () => {
    baseline = new Set(get().savedDays);
    set({ editing: true, workingDays: new Set(get().savedDays), error: null });
  },

  toggleDay: (key) =>
    set((s) => {
      const next = new Set(s.workingDays);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { workingDays: next };
    }),

  cancel: () => set({ editing: false, workingDays: new Set() }),

  save: async () => {
    const me = uid() ?? '';
    const working = get().workingDays;
    const added = [...working].filter((day) => !baseline.has(day));
    const removed = [...baseline].filter((day) => !working.has(day));
    if (!added.length && !removed.length) {
      set({ editing: false });
      return true;
    }
    const desired = [...working];
    const before = [...get().savedDays];
    set({ saving: true, error: null });
    try {
      const outcome = await mutate<string>({
        run: async () => {
          await repository.applyDiff(added, removed);
          await get().load();
        },
        intent: {
          entityId: me,
          kind: 'availability',
          op: 'update',
          payload: desired,
          baseSnapshot: before,
        },
        cacheKey: `availability:${me}`,
        current: before,
        apply: () => desired,
        assign: (rows) => set({ savedDays: new Set(rows) }),
      });
      if (outcome.failed) throw new Error('Saving availability failed');
      set({ editing: false });
      return true;
    } catch (error) {
      log.error('Failed to save availability', error);
      set({ error: error instanceof Error ? error.message : 'Failed to save availability' });
      return false;
    } finally {
      set({ saving: false });
    }
  },
}));
