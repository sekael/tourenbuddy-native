import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { mutate } from '@/core/offline/mutate';
import { isReachable } from '@/core/offline/online';
import { flushThenRefetch, registerReplay } from '@/core/offline/replay';
import type { WriteQueueEntry } from '@/core/offline/write-queue';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import { InboxRepositoryImpl } from '@/features/notifications/data/repositories/inbox-repository-impl';
import { currentReleaseNote } from '@/features/notifications/data/release-notes';
import type { InboxNotification } from '@/features/notifications/domain/entities/inbox-notification';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

/**
 * The inbox (notification-inbox), ported from the PWA's store: newest pages merged with every
 * unread entry (the badge counts past the first page), read, read-all, delete and clear queued
 * offline, kept current by Realtime, and this release's note recorded once per user.
 */
export const INBOX_PAGE_SIZE = 20;
const UNREAD_CAP = 99;
const ALL_KEY_PREFIX = 'inbox-all:';
/** Its own key: a queued clear must not coalesce into a queued read-all. */
const CLEAR_KEY_PREFIX = 'inbox-clear:';

const log = createLogger('InboxStore');
const repository = new InboxRepositoryImpl();
const uid = () => sessionUser.getState().id;
const cacheKey = () => `inbox:${uid()}`;

registerReplay('inbox', async (entry: WriteQueueEntry) => {
  const cutoff = (entry.payload as { cutoff?: string }).cutoff ?? '';
  if (entry.entityId.startsWith(CLEAR_KEY_PREFIX)) await repository.removeAll(cutoff);
  else if (entry.entityId.startsWith(ALL_KEY_PREFIX)) await repository.markAllRead(cutoff);
  else if (entry.op === 'delete') await repository.remove(entry.entityId);
  else await repository.markRead(entry.entityId);
});

const newestFirst = (rows: InboxNotification[]) =>
  [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

function mergeById(...lists: InboxNotification[][]) {
  const byId = new Map<string, InboxNotification>();
  for (const list of lists) for (const e of list) byId.set(e.id, e);
  return newestFirst([...byId.values()]);
}

/** Which source stores have finished a load: until then, "missing" proves nothing. */
export type InboxSourcesReady = {
  friends: boolean;
  tours: boolean;
  batches: boolean;
  links: boolean;
};

type InboxState = {
  entries: InboxNotification[];
  hasMore: boolean;
  isLoading: boolean;
  ready: InboxSourcesReady;
  start: () => void;
  clear: () => void;
  load: () => Promise<void>;
  loadMore: () => Promise<void>;
  find: (id: string) => Promise<InboxNotification | null>;
  markRead: (id: string) => Promise<unknown>;
  markAllRead: () => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  clearAll: () => Promise<unknown>;
};

let stops: (() => void)[] = [];
let cursor: string | null = null;
const noneReady: InboxSourcesReady = { friends: false, tours: false, batches: false, links: false };

export const useInboxStore = create<InboxState>()((set, get) => {
  const write = (
    entityId: string,
    op: 'update' | 'delete',
    payload: Record<string, unknown>,
    apply: (rows: InboxNotification[]) => InboxNotification[],
    online: () => Promise<void>,
  ) =>
    mutate<InboxNotification>({
      run: async () => {
        set({ entries: apply(get().entries) });
        try {
          await online();
        } catch (error) {
          log.error('Inbox write failed', error);
          await get().load();
        }
      },
      intent: { entityId, kind: 'inbox', op, payload },
      cacheKey: cacheKey(),
      current: get().entries,
      apply,
      assign: (rows) => set({ entries: rows }),
    });

  /** Marks a source ready once its loading flag falls, or once it holds data. */
  const watchReady = <S>(
    store: { subscribe: (fn: (s: S, prev: S) => void) => () => void },
    key: keyof InboxSourcesReady,
    loading: (s: S) => boolean,
  ) =>
    store.subscribe((s, prev) => {
      if (loading(prev) && !loading(s) && !get().ready[key]) {
        set({ ready: { ...get().ready, [key]: true } });
      }
    });

  return {
    entries: [],
    hasMore: false,
    isLoading: false,
    ready: noneReady,

    start: () => {
      const me = uid();
      if (!me || stops.length) return;
      stops = [
        subscribeRealtime({
          topic: `inbox-${me}`,
          postgres: [{ event: '*', table: 'notifications', filter: `recipient_id=eq.${me}` }],
          onChange: () => void get().load(),
          onSubscribed: () => void flushThenRefetch(get().load),
        }),
        watchReady(useFriendshipsStore, 'friends', (s) => s.isLoading),
        watchReady(useToursStore, 'tours', (s) => s.isLoading),
        watchReady(useTourSuggestionsStore, 'batches', (s) => s.loading),
        watchReady(useTourLinksStore, 'links', (s) => s.loading),
      ];
      void get().load();
      const note = currentReleaseNote();
      if (note && isReachable()) {
        void repository
          .recordReleaseNote(note.id, note.since)
          .catch((error) => log.warn('Failed to record release note', error));
      }
    },

    clear: () => {
      stops.forEach((stop) => stop());
      stops = [];
      cursor = null;
      set({ entries: [], hasMore: false, isLoading: false, ready: noneReady });
    },

    load: async () => {
      const me = uid();
      if (!me) return;
      set({ isLoading: true });
      try {
        await cachedLoad<InboxNotification[]>(
          `inbox:${me}`,
          async () => {
            const [page, unread] = await Promise.all([
              repository.listPage(null, INBOX_PAGE_SIZE),
              repository.listUnread(UNREAD_CAP),
            ]);
            set({ hasMore: page.length === INBOX_PAGE_SIZE });
            cursor = page.at(-1)?.createdAt ?? null;
            return mergeById(page, unread);
          },
          (rows) => {
            if (uid() === me) set({ entries: newestFirst(rows) });
          },
        );
      } catch (error) {
        log.error('Failed to load inbox', error);
      } finally {
        set({ isLoading: false });
      }
    },

    loadMore: async () => {
      if (!get().hasMore || get().isLoading) return;
      set({ isLoading: true });
      try {
        const page = await repository.listPage(cursor, INBOX_PAGE_SIZE);
        cursor = page.at(-1)?.createdAt ?? cursor;
        set({ hasMore: page.length === INBOX_PAGE_SIZE, entries: mergeById(get().entries, page) });
      } catch (error) {
        log.error('Failed to load more inbox entries', error);
      } finally {
        set({ isLoading: false });
      }
    },

    find: async (id) => {
      const local = get().entries.find((e) => e.id === id);
      if (local) return local;
      try {
        const fetched = await repository.getById(id);
        if (fetched) set({ entries: mergeById(get().entries, [fetched]) });
        return fetched;
      } catch (error) {
        log.warn('Failed to fetch inbox entry', error);
        return null;
      }
    },

    markRead: async (id) => {
      const target = get().entries.find((e) => e.id === id);
      if (!target || target.readAt) return;
      const now = new Date().toISOString();
      return write(
        id,
        'update',
        {},
        (rows) => rows.map((e) => (e.id === id && !e.readAt ? { ...e, readAt: now } : e)),
        () => repository.markRead(id),
      );
    },

    markAllRead: async () => {
      const me = uid();
      const entries = get().entries;
      if (!me || !entries.some((e) => !e.readAt)) return;
      const cutoff = entries[0]!.createdAt;
      const now = new Date().toISOString();
      return write(
        `${ALL_KEY_PREFIX}${me}`,
        'update',
        { cutoff },
        (rows) => rows.map((e) => (!e.readAt && e.createdAt <= cutoff ? { ...e, readAt: now } : e)),
        () => repository.markAllRead(cutoff),
      );
    },

    remove: (id) =>
      write(
        id,
        'delete',
        {},
        (rows) => rows.filter((e) => e.id !== id),
        () => repository.remove(id),
      ),

    clearAll: async () => {
      const me = uid();
      const entries = get().entries;
      if (!me || !entries.length) return;
      const cutoff = entries[0]!.createdAt;
      cursor = null;
      set({ hasMore: false });
      return write(
        `${CLEAR_KEY_PREFIX}${me}`,
        'delete',
        { cutoff },
        (rows) => rows.filter((e) => e.createdAt > cutoff),
        () => repository.removeAll(cutoff),
      );
    },
  };
});
