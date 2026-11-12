import { create } from 'zustand';

import { env } from '@/core/env';
import { createLogger } from '@/core/logging/logger';
import { feedUrlSchema } from '@/features/calendar/data/models/calendar-feed';
import { SupabaseCalendarFeedRepository } from '@/features/calendar/data/repositories/calendar-feed-repository-impl';
import {
  CalendarFeedError,
  type CalendarFeed,
  type CalendarFeedErrorCode,
  type CalendarSettings,
} from '@/features/calendar/domain/repositories/calendar-feed-repository';

import { useAvailabilityStore } from './availability-store';

/**
 * Calendar sync (calendar-sync), ported from the PWA's store: the user's iCal feeds that pre-fill
 * busy days, the window that makes a day count as free, and the private link that puts their
 * tours into their own calendar app. Online only; failures arrive as codes the UI translates.
 */
export type WindowSettings = Omit<CalendarSettings, 'feedToken'>;

const log = createLogger('CalendarFeedStore');
const repository = new SupabaseCalendarFeedRepository();

const minutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Mirrors the `user_calendar_settings` checks, so the UI refuses before the request. */
export function isSatisfiable({ coreStart, coreEnd, minFreeMinutes }: WindowSettings): boolean {
  const span = minutes(coreEnd) - minutes(coreStart);
  return span > 0 && minFreeMinutes > 0 && minFreeMinutes <= span;
}

type FeedState = {
  feeds: CalendarFeed[];
  settings: CalendarSettings | null;
  loading: boolean;
  syncing: boolean;
  error: CalendarFeedErrorCode | null;
  clear: () => void;
  load: () => Promise<void>;
  loadFeeds: () => Promise<void>;
  sync: () => Promise<void>;
  addFeed: (url: string, label: string) => Promise<boolean>;
  removeFeed: (id: string) => Promise<void>;
  relabelFeed: (id: string, label: string) => Promise<void>;
  saveSettings: (next: WindowSettings) => Promise<boolean>;
  regenerateToken: () => Promise<void>;
};

/** The subscribe link for the user's own tours, once the settings are loaded. */
export const outboundUrl = (settings: CalendarSettings | null) =>
  settings && env.EXPO_PUBLIC_NOTIFY_HOOK_URL
    ? `${env.EXPO_PUBLIC_NOTIFY_HOOK_URL}/calendar/${settings.feedToken}.ics`
    : null;

export const useCalendarFeedStore = create<FeedState>()((set, get) => {
  const fail = (error: unknown) => {
    log.error('Calendar sync action failed', error);
    set({ error: error instanceof CalendarFeedError ? error.code : 'unknown' });
  };
  const reloadAvailability = () => useAvailabilityStore.getState().load();

  return {
    feeds: [],
    settings: null,
    loading: false,
    syncing: false,
    error: null,

    clear: () => set({ feeds: [], settings: null, loading: false, syncing: false, error: null }),

    loadFeeds: async () => {
      try {
        set({ feeds: await repository.listFeeds() });
      } catch (error) {
        fail(error);
      }
    },

    load: async () => {
      set({ loading: true, error: null });
      try {
        const [feeds, settings] = await Promise.all([
          repository.listFeeds(),
          repository.getSettings(),
        ]);
        set({ feeds, settings });
      } catch (error) {
        fail(error);
      } finally {
        set({ loading: false });
      }
    },

    sync: async () => {
      set({ syncing: true, error: null });
      try {
        await repository.triggerSync();
      } catch (error) {
        fail(error);
      } finally {
        set({ syncing: false });
      }
      // Even after a failed trigger: an earlier run's feed error may have changed.
      await Promise.all([get().loadFeeds(), reloadAvailability()]);
    },

    addFeed: async (url, label) => {
      set({ error: null });
      const parsed = feedUrlSchema.safeParse(url);
      if (!parsed.success) {
        set({ error: parsed.error.issues[0]?.message === 'not_ical' ? 'not_ical' : 'invalid_url' });
        return false;
      }
      try {
        await repository.addFeed(parsed.data, label.trim() || null);
      } catch (error) {
        fail(error);
        return false;
      }
      await get().sync();
      return true;
    },

    removeFeed: async (id) => {
      set({ error: null });
      try {
        await repository.removeFeed(id);
      } catch (error) {
        fail(error);
        return;
      }
      set({ feeds: get().feeds.filter((f) => f.id !== id) });
      // The last feed gone: the database already dropped its busy days.
      if (get().feeds.length) await get().sync();
      else await reloadAvailability();
    },

    relabelFeed: async (id, label) => {
      set({ error: null });
      const next = label.trim() || null;
      try {
        await repository.relabelFeed(id, next);
        set({ feeds: get().feeds.map((f) => (f.id === id ? { ...f, label: next } : f)) });
      } catch (error) {
        fail(error);
      }
    },

    saveSettings: async (next) => {
      set({ error: null });
      if (!isSatisfiable(next)) {
        set({ error: 'invalid_window' });
        return false;
      }
      try {
        await repository.updateSettings(next);
        set({ settings: { ...get().settings!, ...next } });
      } catch (error) {
        fail(error);
        return false;
      }
      if (get().feeds.length) await get().sync();
      return true;
    },

    regenerateToken: async () => {
      set({ error: null });
      try {
        const feedToken = await repository.regenerateToken();
        set({ settings: { ...get().settings!, feedToken } });
      } catch (error) {
        fail(error);
      }
    },
  };
});
