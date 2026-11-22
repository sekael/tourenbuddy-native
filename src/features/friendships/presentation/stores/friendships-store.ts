import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { BlockedBySenderError } from '@/core/exceptions';
import { newId } from '@/core/files';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { getCached, putCached } from '@/core/offline/entity-cache';
import { mutate } from '@/core/offline/mutate';
import { flushThenRefetch, registerReplay } from '@/core/offline/replay';
import type { WriteQueueEntry } from '@/core/offline/write-queue';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import type {
  FriendRequest,
  Friendship,
} from '@/features/friendships/data/models/friendship-schemas';
import { FriendshipRepositoryImpl } from '@/features/friendships/data/repositories/friendship-repository-impl';

// The two stores call each other at run time only (block → refetch; a send refused by a block),
// so the import cycle is harmless.

import { useUserBlocksStore } from './user-blocks-store';

/**
 * Friend requests and friendships (friendships), ported from the PWA's store: a phone-verified
 * user's requests both ways and their friends, the user id → phone directory that resolves friends'
 * names through the user's own contacts, optimistic writes that reconcile with Realtime echoes, and
 * the unfriend that queues offline. Friend-request actions stay online-only.
 */
type FriendRequestVM = FriendRequest & { _optimistic?: boolean };

type Snapshot = {
  incoming: FriendRequestVM[];
  outgoing: FriendRequestVM[];
  friendships: Friendship[];
};

type Names = { firstName: string | null; lastName: string | null };

type FriendshipsState = Snapshot & {
  isLoading: boolean;
  error: string | null;
  /** Derived, kept in state so selectors return stable references. */
  friendUserIds: Set<string>;
  pendingRequestUserIds: Set<string>;
  userIdToPhoneMap: Map<string, string>;
  userIdToNamesMap: Map<string, Names>;
  start: () => void;
  clear: () => void;
  fetchAll: () => Promise<void>;
  sendRequest: (toUserId: string) => Promise<FriendRequest | null>;
  accept: (requestId: string) => Promise<void>;
  deny: (requestId: string) => Promise<void>;
  cancel: (requestId: string) => Promise<void>;
  removeFriendship: (otherUserId: string) => Promise<void>;
  incomingRequestFrom: (userId: string) => FriendRequest | null;
  currentUserHasAnyRelationship: () => { hasPending: boolean; hasFriendship: boolean };
  findUserByPhone: (phone: string) => Promise<string | null>;
  findUsersByPhones: (phones: string[]) => Promise<{ phone: string; userId: string }[]>;
  findPhonesByUserIds: (userIds: string[]) => Promise<void>;
  ensurePhones: (ids: string[]) => Promise<void>;
  getNamesByUserIds: (ids: string[]) => Promise<void>;
};

const log = createLogger('FriendshipsStore');
const repository = new FriendshipRepositoryImpl();

const uid = () => sessionUser.getState().id;
/** Friend requests and the directory need a verified phone (phone-verification). */
export const isPhoneVerified = () => useAuthStore.getState().user?.phone_confirmed_at != null;

let unsubscribe: (() => void) | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | undefined;
let directoryHydrate: Promise<void> | null = null;
const inFlightPhones = new Map<string, Promise<void>>();

function derive(snapshot: Snapshot) {
  const me = uid();
  return {
    friendUserIds: new Set(
      snapshot.friendships.map((f) =>
        f.requestUserId === me ? f.responseUserId : f.requestUserId,
      ),
    ),
    pendingRequestUserIds: new Set([
      ...snapshot.incoming.map((r) => r.fromUserId),
      ...snapshot.outgoing.map((r) => r.toUserId),
    ]),
  };
}

/** Server rows win; an optimistic row stays until the server has the same pair. */
function reconcile(server: FriendRequest[], current: FriendRequestVM[]): FriendRequestVM[] {
  const pairs = new Set(server.map((r) => `${r.fromUserId}:${r.toUserId}`));
  const ids = new Set(server.map((r) => r.id));
  return [
    ...server,
    ...current.filter(
      (r) => r._optimistic && !pairs.has(`${r.fromUserId}:${r.toUserId}`) && !ids.has(r.id),
    ),
  ];
}

function dedupe(rows: Friendship[]): Friendship[] {
  const seen = new Set<string>();
  return rows.filter((f) => {
    const key = `${f.requestUserId}:${f.responseUserId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

registerReplay('friendship', async (entry: WriteQueueEntry) => {
  const { otherUserId } = entry.payload as { otherUserId: string };
  await repository.removeFriendship(otherUserId);
});

export const useFriendshipsStore = create<FriendshipsState>()((set, get) => {
  const setSnapshot = (next: Partial<Snapshot>) => {
    const merged = { ...pick(get()), ...next };
    set({ ...merged, ...derive(merged) });
  };
  const pick = (s: Snapshot): Snapshot => ({
    incoming: s.incoming,
    outgoing: s.outgoing,
    friendships: s.friendships,
  });
  const persistDirectory = () => {
    const me = uid();
    if (me) void putCached(`friend-directory:${me}`, [...get().userIdToPhoneMap]).catch(() => {});
  };
  const addPhones = (rows: { userId: string; phone: string }[]) => {
    if (rows.length === 0) return;
    const next = new Map(get().userIdToPhoneMap);
    for (const r of rows) next.set(r.userId, r.phone);
    set({ userIdToPhoneMap: next });
    persistDirectory();
  };
  const ensureDirectory = () => {
    const me = uid();
    directoryHydrate ??= (
      me ? getCached<[string, string][]>(`friend-directory:${me}`) : Promise.resolve(undefined)
    )
      .then((entries) => {
        if (!entries?.length) return;
        // An answer from this session wins over the cached one.
        const next = new Map(get().userIdToPhoneMap);
        for (const [id, phone] of entries) if (!next.has(id)) next.set(id, phone);
        set({ userIdToPhoneMap: next });
      })
      .catch(() => {});
    return directoryHydrate;
  };

  return {
    incoming: [],
    outgoing: [],
    friendships: [],
    isLoading: false,
    error: null,
    friendUserIds: new Set(),
    pendingRequestUserIds: new Set(),
    userIdToPhoneMap: new Map(),
    userIdToNamesMap: new Map(),

    start: () => {
      const me = uid();
      if (!me || unsubscribe) return;
      void ensureDirectory();
      unsubscribe = subscribeRealtime({
        topic: `friendships:${me}`,
        postgres: [
          { event: '*', table: 'friend_requests', filter: `to_user_id=eq.${me}` },
          { event: '*', table: 'friend_requests', filter: `from_user_id=eq.${me}` },
          { event: '*', table: 'friendships', filter: `request_user_id=eq.${me}` },
          { event: '*', table: 'friendships', filter: `response_user_id=eq.${me}` },
        ],
        onChange: () => {
          clearTimeout(refetchTimer);
          refetchTimer = setTimeout(() => void get().fetchAll(), 150);
        },
        onSubscribed: () => void flushThenRefetch(get().fetchAll),
      });
      void get().fetchAll();
    },

    clear: () => {
      unsubscribe?.();
      unsubscribe = null;
      clearTimeout(refetchTimer);
      directoryHydrate = null;
      inFlightPhones.clear();
      set({
        incoming: [],
        outgoing: [],
        friendships: [],
        friendUserIds: new Set(),
        pendingRequestUserIds: new Set(),
        userIdToPhoneMap: new Map(),
        userIdToNamesMap: new Map(),
        error: null,
        isLoading: false,
      });
    },

    fetchAll: async () => {
      const me = uid();
      if (!me || !isPhoneVerified()) return;
      set({ isLoading: true, error: null });
      try {
        await cachedLoad<Snapshot[]>(
          `friendships:${me}`,
          async () => {
            const [requests, friendships] = await Promise.all([
              repository.listIncoming(),
              repository.listFriendships(),
            ]);
            return [
              {
                incoming: requests.filter((r) => r.toUserId === me),
                outgoing: requests.filter((r) => r.fromUserId === me),
                friendships: dedupe(friendships),
              },
            ];
          },
          ([snapshot]) => {
            if (!snapshot || uid() !== me) return;
            setSnapshot({
              incoming: reconcile(snapshot.incoming, get().incoming),
              outgoing: reconcile(snapshot.outgoing, get().outgoing),
              friendships: snapshot.friendships,
            });
          },
        );
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to load friendships' });
        log.error('Failed to fetch friendships', error);
      } finally {
        set({ isLoading: false });
      }
    },

    sendRequest: async (toUserId) => {
      const me = uid();
      if (!me || !isPhoneVerified()) return null;
      const tempId = newId();
      const optimistic: FriendRequestVM = {
        id: tempId,
        fromUserId: me,
        toUserId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        respondedAt: null,
        _optimistic: true,
      };
      setSnapshot({ outgoing: [...get().outgoing, optimistic] });
      try {
        const created = await repository.sendRequest(toUserId);
        setSnapshot({
          outgoing: get()
            .outgoing.filter((r) => r.id !== tempId && r.id !== created.id)
            .concat(created),
        });
        return created;
      } catch (error) {
        setSnapshot({ outgoing: get().outgoing.filter((r) => r.id !== tempId) });
        if (error instanceof BlockedBySenderError) {
          useUserBlocksStore.getState().handleSendRejectedByBlock(toUserId);
        }
        log.error('Failed to send friend request', error);
        throw error;
      }
    },

    accept: async (requestId) => {
      await mutate(async () => {
        const me = uid();
        const req = get().incoming.find((r) => r.id === requestId);
        if (!req || !me) return;
        const optimistic: Friendship = {
          requestUserId: req.fromUserId,
          responseUserId: me,
          createdAt: new Date().toISOString(),
          requestId,
        };
        setSnapshot({
          incoming: get().incoming.filter((r) => r.id !== requestId),
          friendships: [...get().friendships, optimistic],
        });
        try {
          await repository.accept(requestId);
        } catch (error) {
          setSnapshot({
            incoming: [...get().incoming, req],
            friendships: get().friendships.filter((f) => f !== optimistic),
          });
          log.error('Failed to accept friend request', error);
          throw error;
        }
      });
    },

    deny: async (requestId) => {
      const req = get().incoming.find((r) => r.id === requestId);
      setSnapshot({ incoming: get().incoming.filter((r) => r.id !== requestId) });
      try {
        await repository.deny(requestId);
      } catch (error) {
        if (req) setSnapshot({ incoming: [...get().incoming, req] });
        log.error('Failed to deny friend request', error);
        throw error;
      }
    },

    cancel: async (requestId) => {
      const req = get().outgoing.find((r) => r.id === requestId);
      setSnapshot({ outgoing: get().outgoing.filter((r) => r.id !== requestId) });
      try {
        await repository.cancel(requestId);
      } catch (error) {
        if (req) setSnapshot({ outgoing: [...get().outgoing, req] });
        log.error('Failed to cancel friend request', error);
        throw error;
      }
    },

    removeFriendship: async (otherUserId) => {
      const me = uid();
      if (!me) return;
      const isMatch = (f: Friendship) =>
        (f.requestUserId === me && f.responseUserId === otherUserId) ||
        (f.requestUserId === otherUserId && f.responseUserId === me);
      const removed = get().friendships.find(isMatch);
      if (!removed) return;
      const current = pick(get());
      const applied: Snapshot = {
        ...current,
        friendships: current.friendships.filter((f) => !isMatch(f)),
      };
      await mutate<Snapshot>({
        run: async () => {
          setSnapshot({ friendships: applied.friendships });
          try {
            await repository.removeFriendship(otherUserId);
          } catch (error) {
            setSnapshot({ friendships: [...get().friendships, removed] });
            log.error('Failed to remove friendship', error);
            throw error;
          }
        },
        intent: {
          entityId: `friendship:${otherUserId}`,
          kind: 'friendship',
          op: 'delete',
          payload: { otherUserId },
          baseSnapshot: current,
        },
        cacheKey: `friendships:${me}`,
        current: [current],
        apply: () => [applied],
        assign: ([snapshot]) => snapshot && setSnapshot(snapshot),
      });
    },

    incomingRequestFrom: (userId) => get().incoming.find((r) => r.fromUserId === userId) ?? null,

    currentUserHasAnyRelationship: () => ({
      hasPending: get().incoming.length > 0 || get().outgoing.length > 0,
      hasFriendship: get().friendships.length > 0,
    }),

    findUserByPhone: async (phone) => {
      if (!isPhoneVerified()) return null;
      try {
        const userId = await repository.findUserByPhone(phone);
        if (userId) addPhones([{ userId, phone }]);
        return userId;
      } catch (error) {
        log.error('findUserByPhone failed', error);
        return null;
      }
    },

    findUsersByPhones: async (phones) => {
      if (!isPhoneVerified() || phones.length === 0) return [];
      try {
        const results = await repository.findUsersByPhones(phones);
        addPhones(results);
        return results;
      } catch (error) {
        log.error('findUsersByPhones failed', error);
        return [];
      }
    },

    findPhonesByUserIds: async (userIds) => {
      if (!isPhoneVerified() || userIds.length === 0) return;
      const missing = userIds.filter((id) => !get().userIdToPhoneMap.has(id));
      if (missing.length === 0) return;
      // N callers asking for one id share one lookup.
      const awaited = missing
        .filter((id) => inFlightPhones.has(id))
        .map((id) => inFlightPhones.get(id)!);
      const fresh = missing.filter((id) => !inFlightPhones.has(id));
      if (fresh.length > 0) {
        const lookup = (async () => {
          try {
            addPhones(await repository.findPhonesByUserIds(fresh));
          } catch (error) {
            log.error('findPhonesByUserIds failed', error);
          } finally {
            for (const id of fresh) inFlightPhones.delete(id);
          }
        })();
        for (const id of fresh) inFlightPhones.set(id, lookup);
        awaited.push(lookup);
      }
      await Promise.all(awaited);
    },

    ensurePhones: async (ids) => {
      await ensureDirectory();
      await get().findPhonesByUserIds(ids);
    },

    getNamesByUserIds: async (ids) => {
      if (!isPhoneVerified() || ids.length === 0) return;
      const missing = ids.filter((id) => !get().userIdToNamesMap.has(id));
      if (missing.length === 0) return;
      try {
        const results = await repository.getNamesByUserIds(missing);
        if (results.length === 0) return;
        const next = new Map(get().userIdToNamesMap);
        for (const r of results)
          next.set(r.userId, { firstName: r.firstName, lastName: r.lastName });
        set({ userIdToNamesMap: next });
      } catch (error) {
        log.error('getNamesByUserIds failed', error);
      }
    },
  };
});
