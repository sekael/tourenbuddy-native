import { AppState } from 'react-native';
import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { BlockAlreadyExistsError, NotBlockedError } from '@/core/exceptions';
import { createLogger } from '@/core/logging/logger';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import type { UserBlock } from '@/features/friendships/data/models/user-block-schemas';
import type { BlockedUserInfo } from '@/features/friendships/domain/repositories/user-block-repository';
import { UserBlockRepositoryImpl } from '@/features/friendships/data/repositories/user-block-repository-impl';

import { useFriendshipsStore } from './friendships-store';

/**
 * The user's own blocks (user-blocks), ported from the PWA: active blocks with the blocked users'
 * names and phones, the 48-hour cooldown carried by the rows, a short-lived cache of "am I blocked
 * by X", and reports (which alert the operator, Phase 2).
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const log = createLogger('UserBlocksStore');
const repository = new UserBlockRepositoryImpl();

type BlocksState = {
  blocks: UserBlock[];
  blockedUserInfo: Map<string, BlockedUserInfo>;
  blockedUserIds: Set<string>;
  blockedPhones: Set<string>;
  loading: boolean;
  error: string | null;
  isBlockedByCache: Map<string, { value: boolean; ts: number }>;
  start: () => void;
  clear: () => void;
  fetchBlocks: () => Promise<void>;
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  isBlockedBy: (userId: string) => Promise<boolean>;
  handleSendRejectedByBlock: (userId: string) => void;
  invalidateIsBlockedByCache: (userId?: string) => void;
  report: (userId: string, reason: string | null) => Promise<void>;
};

let unsubscribe: (() => void) | null = null;

function derived(blocks: UserBlock[], info: Map<string, BlockedUserInfo>) {
  const blockedUserIds = new Set(
    blocks.filter((b) => b.unblockedAt === null).map((b) => b.blockedUserId),
  );
  const blockedPhones = new Set<string>();
  for (const id of blockedUserIds) {
    const phone = info.get(id)?.phone;
    if (phone) blockedPhones.add(phone);
  }
  return { blockedUserIds, blockedPhones };
}

export const useUserBlocksStore = create<BlocksState>()((set, get) => ({
  blocks: [],
  blockedUserInfo: new Map(),
  blockedUserIds: new Set(),
  blockedPhones: new Set(),
  loading: false,
  error: null,
  isBlockedByCache: new Map(),

  start: () => {
    const me = sessionUser.getState().id;
    if (!me || unsubscribe) return;
    unsubscribe = subscribeRealtime({
      topic: `user-blocks:${me}`,
      postgres: [
        { event: '*', table: 'user_blocks', filter: `blocker_user_id=eq.${me}` },
        { event: 'DELETE', table: 'friendships', filter: `request_user_id=eq.${me}` },
        { event: 'DELETE', table: 'friendships', filter: `response_user_id=eq.${me}` },
        { event: 'UPDATE', table: 'friend_requests', filter: `from_user_id=eq.${me}` },
        { event: 'UPDATE', table: 'friend_requests', filter: `to_user_id=eq.${me}` },
      ],
      onChange: () => {
        get().invalidateIsBlockedByCache();
        void get().fetchBlocks();
      },
      onSubscribed: () => void get().fetchBlocks(),
    });
  },

  clear: () => {
    unsubscribe?.();
    unsubscribe = null;
    set({
      blocks: [],
      blockedUserInfo: new Map(),
      blockedUserIds: new Set(),
      blockedPhones: new Set(),
      error: null,
      isBlockedByCache: new Map(),
    });
  },

  fetchBlocks: async () => {
    if (!sessionUser.getState().id) return;
    set({ loading: true, error: null });
    try {
      const [rows, infos] = await Promise.all([
        repository.listActive(),
        repository.listBlockedUsers(),
      ]);
      const info = new Map(infos.map((i) => [i.userId, i]));
      set({ blocks: rows, blockedUserInfo: info, ...derived(rows, info) });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load blocks' });
      log.error('Failed to fetch blocks', error);
    } finally {
      set({ loading: false });
    }
  },

  block: async (userId) => {
    try {
      await repository.block(userId);
      await get().fetchBlocks();
      get().invalidateIsBlockedByCache(userId);
      // The block ended any friendship and pending request: show it at once.
      await useFriendshipsStore.getState().fetchAll();
    } catch (error) {
      if (error instanceof BlockAlreadyExistsError) return;
      throw error;
    }
  },

  unblock: async (userId) => {
    try {
      await repository.unblock(userId);
      const blocks = get().blocks.filter((b) => b.blockedUserId !== userId);
      set({ blocks, ...derived(blocks, get().blockedUserInfo) });
      get().invalidateIsBlockedByCache(userId);
    } catch (error) {
      if (error instanceof NotBlockedError) return;
      throw error;
    }
  },

  isBlockedBy: async (userId) => {
    const cached = get().isBlockedByCache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;
    try {
      const value = await repository.isBlockedBy(userId);
      set({
        isBlockedByCache: new Map(get().isBlockedByCache).set(userId, { value, ts: Date.now() }),
      });
      return value;
    } catch (error) {
      log.error('isBlockedBy failed', error);
      return false;
    }
  },

  handleSendRejectedByBlock: (userId) =>
    set({
      isBlockedByCache: new Map(get().isBlockedByCache).set(userId, {
        value: true,
        ts: Date.now(),
      }),
    }),

  invalidateIsBlockedByCache: (userId) => {
    if (!userId) {
      set({ isBlockedByCache: new Map() });
      return;
    }
    const next = new Map(get().isBlockedByCache);
    next.delete(userId);
    set({ isBlockedByCache: next });
  },

  report: (userId, reason) => repository.report(userId, reason),
}));

// Back in the foreground, someone may have blocked the user meanwhile: ask again.
AppState.addEventListener('change', (state) => {
  if (state === 'active') useUserBlocksStore.getState().invalidateIsBlockedByCache();
});

/** The wait between a block and its unblock (user-blocks; the server enforces it). */
const UNBLOCK_COOLDOWN_MS = 48 * 60 * 60 * 1000;

/** When the block can be lifted, while that is still ahead; null once it can (or no block). */
export function unblockOpensAt(block: UserBlock | undefined, now = Date.now()): Date | null {
  if (!block || block.unblockedAt !== null) return null;
  const at = new Date(block.lastBlockedAt).getTime() + UNBLOCK_COOLDOWN_MS;
  return at > now ? new Date(at) : null;
}
