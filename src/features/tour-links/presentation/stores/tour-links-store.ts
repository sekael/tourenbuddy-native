import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { createLogger } from '@/core/logging/logger';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import { TourLinksRepositoryImpl } from '@/features/tour-links/data/repositories/tour-links-repository-impl';
import type {
  BackfillCollisionPair,
  TourLinkMember,
  TourLinkRequest,
} from '@/features/tour-links/domain/entities/tour-link';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

/**
 * Same-objective links between friends' tours (tour-links), ported from the PWA's store: the
 * groups the user's tours are in, the pending link requests, and the groups of friends' tours (so
 * a merge the server forbids is never offered). Refetches when the tour sets change, since the
 * tours load after the subscription.
 */
const log = createLogger('TourLinksStore');
const repository = new TourLinksRepositoryImpl();

type Derived = {
  groupIdByTourId: Map<string, string>;
  /** tour id → sibling tour ids (without itself). */
  siblingsByTourId: Map<string, string[]>;
  /** tour id → pending requests touching it. */
  requestsByTourId: Map<string, TourLinkRequest[]>;
};

type State = Derived & {
  loading: boolean;
  error: string | null;
  members: TourLinkMember[];
  pendingRequests: TourLinkRequest[];
  start: () => void;
  clear: () => void;
  fetchAll: () => Promise<void>;
  createRequest: (initiatorTourId: string, targetTourId: string) => Promise<string>;
  acceptRequest: (requestId: string) => Promise<unknown>;
  declineRequest: (requestId: string) => Promise<void>;
  withdrawRequest: (requestId: string) => Promise<void>;
  /** Own tours with a friend's on the same goal, not linked yet (all friendships). */
  listBackfill: () => Promise<BackfillCollisionPair[]>;
};

function derive(
  members: TourLinkMember[],
  requests: TourLinkRequest[],
  friendGroups: Map<string, string>,
): Derived {
  const byGroup = new Map<string, string[]>();
  for (const m of members) byGroup.set(m.groupId, [...(byGroup.get(m.groupId) ?? []), m.tourId]);
  const groupIdByTourId = new Map<string, string>();
  for (const m of members) groupIdByTourId.set(m.tourId, m.groupId);
  for (const [tourId, groupId] of friendGroups) {
    if (!groupIdByTourId.has(tourId)) groupIdByTourId.set(tourId, groupId);
  }
  const siblingsByTourId = new Map<string, string[]>();
  for (const m of members) {
    siblingsByTourId.set(
      m.tourId,
      (byGroup.get(m.groupId) ?? []).filter((id) => id !== m.tourId),
    );
  }
  const requestsByTourId = new Map<string, TourLinkRequest[]>();
  for (const r of requests) {
    for (const id of [r.initiatorTourId, r.targetTourId]) {
      requestsByTourId.set(id, [...(requestsByTourId.get(id) ?? []), r]);
    }
  }
  return { groupIdByTourId, siblingsByTourId, requestsByTourId };
}

const empty = () => ({ members: [], pendingRequests: [], ...derive([], [], new Map()) });

let unsubscribe: (() => void)[] = [];
let seq = 0;

export const useTourLinksStore = create<State>()((set, get) => ({
  loading: false,
  error: null,
  ...empty(),

  start: () => {
    const me = sessionUser.getState().id;
    if (!me || unsubscribe.length) return;
    const refetch = () =>
      void get()
        .fetchAll()
        .catch((e) => log.warn('refetch failed', e));
    // Requests drive the banners, members the linked rows and the map's chain badge; RLS scopes
    // both tables to the user's own and partners' tours.
    unsubscribe.push(
      subscribeRealtime({
        topic: `tour-links:${me}`,
        postgres: [
          { event: '*', table: 'tour_link_request' },
          { event: '*', table: 'tour_link_member' },
        ],
        onChange: refetch,
        onSubscribed: refetch,
      }),
    );
    // Tours load after the subscription: refetch when either tour set changes.
    const ids = (s: ReturnType<typeof useToursStore.getState>) =>
      `${s.tours
        .map((t) => t.id)
        .sort()
        .join()}|${s.friendTours
        .map((t) => t.id)
        .sort()
        .join()}`;
    let last = ids(useToursStore.getState());
    unsubscribe.push(
      useToursStore.subscribe((s) => {
        const next = ids(s);
        if (next !== last) {
          last = next;
          refetch();
        }
      }),
    );
  },

  clear: () => {
    unsubscribe.forEach((end) => end());
    unsubscribe = [];
    seq++;
    set({ ...empty(), error: null, loading: false });
  },

  fetchAll: async () => {
    const { tours, friendTours } = useToursStore.getState();
    const owned = tours.map((t) => t.id);
    const friends = friendTours.map((t) => t.id);
    const mine = ++seq;
    if (owned.length === 0) {
      set(empty());
      return;
    }
    set({ loading: true, error: null });
    try {
      const [members, requests, friendRows] = await Promise.all([
        repository.listGroupsForTours(owned),
        repository.listPendingRequestsForTours(owned),
        friends.length ? repository.listFriendTourGroupIds(friends) : Promise.resolve([]),
      ]);
      if (mine !== seq) return;
      const friendGroups = new Map(friendRows.map((r) => [r.tourId, r.groupId]));
      set({ members, pendingRequests: requests, ...derive(members, requests, friendGroups) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'failed_to_load_tour_links' });
      log.error('fetchAll failed', err);
    } finally {
      if (mine === seq) set({ loading: false });
    }
  },

  createRequest: async (initiatorTourId, targetTourId) => {
    const id = await repository.createRequest(initiatorTourId, targetTourId);
    await get().fetchAll();
    return id;
  },
  acceptRequest: async (requestId) => {
    const result = await repository.acceptRequest(requestId);
    await get().fetchAll();
    return result;
  },
  declineRequest: async (requestId) => {
    await repository.declineRequest(requestId);
    await get().fetchAll();
  },
  withdrawRequest: async (requestId) => {
    await repository.withdrawRequest(requestId);
    await get().fetchAll();
  },
  listBackfill: () => repository.listAllBackfillCollisions(),
}));
