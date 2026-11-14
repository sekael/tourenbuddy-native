import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { newId } from '@/core/files';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { mutate, type MutateOutcome } from '@/core/offline/mutate';
import { isReachable } from '@/core/offline/online';
import { flushThenRefetch, PermanentReplayError, registerReplay } from '@/core/offline/replay';
import { clearPendingUpload, isPendingUpload, stagedUri } from '@/core/offline/staged-files';
import type { WriteQueueEntry } from '@/core/offline/write-queue';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import type { TourOuting } from '@/features/tours/data/models/tour-schema';
import type { Visibility } from '@/features/tours/data/models/visibility';
import { ToursRepositoryImpl } from '@/features/tours/data/repositories/tours-repository-impl';
import { removeGpx, uploadGpxToKey } from '@/features/tours/data/services/gpx-storage-service';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import { withTourTypes, type Tour, type TourDraft } from '@/features/tours/domain/entities/tour';
import { appendedOuting, movedSegment } from '@/features/tours/domain/outing';
import { trackLines } from '@/features/tours/domain/route-metrics';
import { sameLine, sameTour } from '@/features/tours/domain/same-tour';

const log = createLogger('ToursStore');
const repository = new ToursRepositoryImpl();

type Point = { lng: number; lat: number };

/** Serializable replay payload for a tour create or update (DC3). */
type TourWritePayload = { draft: TourDraft; goal: Point };

type ToursState = {
  tours: Tour[];
  friendTours: Tour[];
  isLoading: boolean;
  error: string | null;
  /** Subscribes to own tours and friends' tours of the signed-in user; loads both. */
  start: () => void;
  /** Ends the subscriptions and empties the store (sign-out, user change). */
  clear: () => void;
  loadTours: () => Promise<void>;
  loadFriendTours: () => Promise<void>;
  createTourFromDraft: (
    draft: TourDraft,
    goal: Point,
    id?: string | null,
  ) => Promise<string | null>;
  dropIfDuplicate: (draft: TourDraft, goal: Point) => Promise<Tour | null>;
  updateTour: (
    id: string,
    draft: TourDraft,
    goal: Point,
    gpxRemoved?: boolean,
  ) => Promise<MutateOutcome<Tour[] | void>>;
  setCompleted: (tourId: string, completed: boolean) => Promise<unknown>;
  setVisibility: (tourId: string, visibility: Visibility) => Promise<unknown>;
  deleteTour: (id: string) => Promise<unknown>;
  /** A deleted contact leaves every tour's partner list (contacts store calls it). */
  dropPartner: (contactId: string) => void;
  ensureOuting: (anchorId: string) => Promise<TourOuting | null>;
  keepFirstDay: (tourId: string) => Promise<void>;
  nextInOuting: (outing: TourOuting) => TourOuting;
  addToOuting: (anchorId: string, tourId: string) => Promise<void>;
  renameOuting: (segments: Tour[], name: string) => Promise<void>;
  reorderSegments: (segments: Tour[], from: number, to: number) => Promise<void>;
  connectSegments: (prev: Tour, next: Tour) => Promise<void>;
  removeFromOuting: (segments: Tour[], tourId: string) => Promise<void>;
};

let unsubscribe: (() => void)[] = [];
// Monotonic token: only the latest-initiated friend-tour load assigns, so a slow stale result
// (cache or network) can't blank a newer one.
let friendToursSeq = 0;

const uid = () => sessionUser.getState().id;
const cacheKey = () => `tours:${uid()}`;

/** A full Tour for the optimistic apply, from a create or update draft (`base` = existing). */
export function tourFromDraft(id: string, draft: TourDraft, goal: Point, base: Tour | null): Tour {
  return {
    id,
    userId: base?.userId ?? uid() ?? '',
    plannedDate: draft.plannedDate ?? null,
    endDate: draft.endDate ?? null,
    goal,
    name: draft.name,
    partnerIds: draft.partnerIds,
    tourTypes: draft.tourTypes,
    elevation: draft.elevation,
    gpxFilepath: draft.gpxFilepath ?? null,
    description: draft.description,
    seasons: draft.seasons,
    startPoint: draft.startPoint,
    endPoint: draft.endPoint,
    startPointName: draft.startPointName ?? null,
    startPointElevation: draft.startPointElevation ?? null,
    endPointName: draft.endPointName ?? null,
    endPointElevation: draft.endPointElevation ?? null,
    equipment: draft.equipment,
    notes: draft.notes,
    completed: draft.completed ?? base?.completed ?? false,
    visibility: draft.visibility ?? base?.visibility ?? 'friends',
    updatedAt: base?.updatedAt ?? null,
    // undefined = keep, like the server does for a null `p_outing`.
    outing: draft.outing === undefined ? (base?.outing ?? null) : draft.outing,
    // undefined = keep, like the server does for null `p_grade` / `p_start_time`.
    grade: draft.grade === undefined ? (base?.grade ?? null) : draft.grade,
    startTime: !draft.plannedDate
      ? null
      : draft.startTime === undefined
        ? (base?.startTime ?? null)
        : draft.startTime,
    // undefined = keep while the activities stay, like the server.
    legs:
      draft.legs !== undefined
        ? draft.legs
        : base?.legs && base.tourTypes.join() === draft.tourTypes.join()
          ? base.legs
          : null,
    isFriendTour: false,
  } as Tour;
}

/** A tour back into a full draft, so toggles reuse the update path. */
export function tourToDraft(tour: Tour): TourDraft {
  return {
    name: tour.name,
    plannedDate: tour.plannedDate,
    endDate: tour.endDate,
    partnerIds: tour.partnerIds,
    tourTypes: tour.tourTypes,
    elevation: tour.elevation,
    gpxFilepath: tour.gpxFilepath,
    description: tour.description,
    seasons: tour.seasons,
    startPoint: tour.startPoint,
    endPoint: tour.endPoint,
    startPointName: tour.startPointName,
    startPointElevation: tour.startPointElevation,
    endPointName: tour.endPointName,
    endPointElevation: tour.endPointElevation,
    equipment: tour.equipment,
    notes: tour.notes,
    completed: tour.completed,
    visibility: tour.visibility,
    grade: tour.grade ?? null,
    startTime: tour.startTime ?? null,
    legs: tour.legs ?? null,
  };
}

/** A GPX staged offline is uploaded before the row write that names it (idempotent upsert). */
async function uploadStagedGpx(gpxFilepath: string | null | undefined): Promise<void> {
  if (!gpxFilepath || !(await isPendingUpload(gpxFilepath))) return;
  const uri = stagedUri(gpxFilepath);
  if (!uri) throw new PermanentReplayError('staged GPX is missing');
  await uploadGpxToKey(gpxFilepath, {
    uri,
    name: 'track.gpx',
    type: 'application/gpx+xml',
    size: 0,
  });
  await clearPendingUpload(gpxFilepath);
}

/** Replays a queued tour write (DC3): one idempotent call by op; the database notifies once. */
async function replayTourWrite(entry: WriteQueueEntry): Promise<void> {
  const raw = entry.payload as TourWritePayload;
  const payload = raw.draft ? { ...raw, draft: withTourTypes(raw.draft) } : raw;
  if (entry.op === 'delete') {
    await repository.deleteTour(entry.entityId);
    const gpxFilepath = (entry.baseSnapshot as Tour | undefined)?.gpxFilepath;
    if (gpxFilepath) await removeGpx(gpxFilepath).catch((e) => log.warn('GPX orphaned', e));
  } else if (entry.op === 'create') {
    // File first: a create naming a never-uploaded GPX would leave a dangling path.
    await uploadStagedGpx(payload.draft.gpxFilepath);
    await repository.createTourWithPartners(entry.entityId, payload.draft, payload.goal);
  } else {
    // Last write wins (DC5): a server row newer than our baseline won.
    const serverTs = await repository.getUpdatedAt(entry.entityId);
    if (serverTs === null) throw new PermanentReplayError('tour was deleted on the server');
    if (entry.baseUpdatedAt && new Date(serverTs) > new Date(entry.baseUpdatedAt)) {
      throw new PermanentReplayError('tour changed on the server since this edit (LWW loser)');
    }
    await uploadStagedGpx(payload.draft.gpxFilepath);
    const updated = await repository.updateTour(entry.entityId, payload.draft, payload.goal);
    if (!updated) throw new PermanentReplayError('tour was deleted on the server');
  }
}
registerReplay('tour', replayTourWrite);

export const useToursStore = create<ToursState>()((set, get) => {
  const update = (id: string, draft: TourDraft, goal: Point) => get().updateTour(id, draft, goal);
  const setOuting = async (tourId: string, outing: TourOuting | null) => {
    const tour = get().tours.find((t) => t.id === tourId);
    if (tour) await update(tourId, { ...tourToDraft(tour), outing }, tour.goal);
  };

  return {
    tours: [],
    friendTours: [],
    isLoading: false,
    error: null,

    start: () => {
      const userId = uid();
      if (!userId || unsubscribe.length > 0) return;
      unsubscribe = [
        subscribeRealtime({
          topic: `tours:${userId}`,
          postgres: [
            { event: '*', table: 'tours', filter: `user_id=eq.${userId}` },
            { event: '*', table: 'tour_partners', filter: `user_id=eq.${userId}` },
          ],
          onChange: () => void get().loadTours(),
          // DC4: drain the outbox before the reconnect refetch.
          onSubscribed: () => void flushThenRefetch(get().loadTours),
        }),
        subscribeRealtime({
          topic: `friend-tours:${userId}`,
          broadcast: 'refetch',
          onChange: () => void get().loadFriendTours(),
          onSubscribed: () => void get().loadFriendTours(),
        }),
      ];
      void get().loadTours();
      void get().loadFriendTours();
    },

    clear: () => {
      unsubscribe.forEach((end) => end());
      unsubscribe = [];
      friendToursSeq++;
      set({ tours: [], friendTours: [], error: null, isLoading: false });
    },

    loadTours: async () => {
      const userId = uid();
      if (!userId) return;
      set({ isLoading: true, error: null });
      try {
        await cachedLoad(
          `tours:${userId}`,
          () => repository.listToursForUser(userId),
          (result) => {
            if (uid() === userId) set({ tours: result.map(withTourTypes) });
          },
        );
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to load tours' });
        log.error('Failed to load tours', error);
      } finally {
        set({ isLoading: false });
      }
    },

    loadFriendTours: async () => {
      const userId = uid();
      if (!userId) return;
      const request = ++friendToursSeq;
      try {
        await cachedLoad(
          `friend-tours:${userId}`,
          () => repository.listFriendTours(),
          (result) => {
            if (request === friendToursSeq) set({ friendTours: result.map(withTourTypes) });
          },
        );
      } catch (error) {
        log.error('Failed to load friend tours', error);
      }
    },

    createTourFromDraft: async (draft, goal, preUploadedId = null) => {
      if (!uid()) return null;
      const id = preUploadedId ?? newId();
      await mutate<Tour>({
        run: async () => {
          // One atomic write: tour, partners, visibility and the GPX path in one RPC.
          await repository.createTourWithPartners(id, draft, goal);
          await get().loadTours();
        },
        intent: { entityId: id, kind: 'tour', op: 'create', payload: { draft, goal } },
        cacheKey: cacheKey(),
        current: get().tours,
        apply: (rows) => [...rows, tourFromDraft(id, draft, goal, null)],
        assign: (rows) => set({ tours: rows }),
      });
      // Client-minted, so final online and offline alike.
      return id;
    },

    dropIfDuplicate: async (draft, goal) => {
      const copy = tourFromDraft('', draft, goal, null);
      for (const tour of get().tours.filter((t) => sameTour(t, copy))) {
        const tracks =
          tour.gpxFilepath && copy.gpxFilepath
            ? await Promise.all([
                loadGpxTrack({ id: tour.id, gpxFilepath: tour.gpxFilepath }),
                loadGpxTrack({ id: '', gpxFilepath: copy.gpxFilepath }),
              ])
            : null;
        if (
          tracks &&
          !(
            tracks[0] &&
            tracks[1] &&
            sameLine(trackLines(tracks[0]).flat(), trackLines(tracks[1]).flat())
          )
        ) {
          continue;
        }
        const upload = copy.gpxFilepath;
        if (upload && !get().tours.some((t) => t.gpxFilepath === upload)) {
          removeGpx(upload).catch(() => {});
          clearPendingUpload(upload).catch(() => {});
        }
        return tour;
      }
      return null;
    },

    updateTour: (id, draft, goal, gpxRemoved = false) => {
      const existing = get().tours.find((t) => t.id === id) ?? null;
      const previousFilepath = existing?.gpxFilepath ?? null;
      const newFilepath = gpxRemoved ? null : (draft.gpxFilepath ?? null);
      const draftWithFilepath: TourDraft = { ...draft, gpxFilepath: newFilepath };
      const applyEdit = (rows: Tour[]): Tour[] =>
        existing
          ? rows.map((t) =>
              t.id === id ? tourFromDraft(id, draftWithFilepath, goal, existing) : t,
            )
          : rows;

      return mutate<Tour>({
        run: async () => {
          // Optimistic online too, so a toggle feels instant; rolled back on failure.
          const rollback = get().tours;
          set({ tours: applyEdit(rollback) });
          let updated: boolean;
          try {
            updated = await repository.updateTour(id, draftWithFilepath, goal);
          } catch (error) {
            set({
              tours: rollback,
              error: error instanceof Error ? error.message : 'Failed to update tour',
            });
            log.error('updateTour failed', error);
            throw error;
          }
          // false: the tour is gone (a concurrent delete); never resurrect it locally.
          if (!updated) {
            set({ tours: rollback, error: 'Failed to update tour' });
            throw new Error('Tour no longer exists');
          }
          if (previousFilepath && previousFilepath !== newFilepath) {
            await removeGpx(previousFilepath).catch((e) => log.warn('Old GPX orphaned', e));
          }
        },
        intent: {
          entityId: id,
          kind: 'tour',
          op: 'update',
          payload: { draft: draftWithFilepath, goal },
          baseSnapshot: existing,
          baseUpdatedAt: existing?.updatedAt ?? undefined,
        },
        cacheKey: cacheKey(),
        current: get().tours,
        apply: applyEdit,
        assign: (rows) => set({ tours: rows }),
      });
    },

    setCompleted: async (tourId, completed) => {
      const tour = get().tours.find((t) => t.id === tourId);
      if (!tour) return;
      return update(tourId, { ...tourToDraft(tour), completed }, tour.goal);
    },

    setVisibility: async (tourId, visibility) => {
      const tour = get().tours.find((t) => t.id === tourId);
      if (!tour) return;
      return update(tourId, { ...tourToDraft(tour), visibility }, tour.goal);
    },

    deleteTour: (id) => {
      const tour = get().tours.find((t) => t.id === id) ?? null;
      return mutate<Tour>({
        run: async () => {
          await repository.deleteTour(id);
          if (tour?.gpxFilepath) {
            await removeGpx(tour.gpxFilepath).catch((e) => log.warn('GPX orphaned', e));
          }
          set({ tours: get().tours.filter((t) => t.id !== id) });
        },
        intent: { entityId: id, kind: 'tour', op: 'delete', payload: {}, baseSnapshot: tour },
        cacheKey: cacheKey(),
        current: get().tours,
        apply: (rows) => rows.filter((t) => t.id !== id),
        assign: (rows) => set({ tours: rows }),
      });
    },

    dropPartner: (contactId) => {
      const { tours } = get();
      if (!tours.some((t) => t.partnerIds.includes(contactId))) return;
      set({
        tours: tours.map((t) =>
          t.partnerIds.includes(contactId)
            ? { ...t, partnerIds: t.partnerIds.filter((id) => id !== contactId) }
            : t,
        ),
      });
    },

    ensureOuting: async (anchorId) => {
      const anchor = get().tours.find((t) => t.id === anchorId);
      if (!anchor) return null;
      if (anchor.outing) return anchor.outing;
      const outing: TourOuting = { id: newId(), name: null, position: 0 };
      await setOuting(anchorId, outing);
      return outing;
    },

    keepFirstDay: async (tourId) => {
      const tour = get().tours.find((t) => t.id === tourId);
      if (tour?.endDate) await update(tourId, { ...tourToDraft(tour), endDate: null }, tour.goal);
    },

    nextInOuting: (outing) =>
      appendedOuting(
        outing,
        get().tours.filter((t) => t.outing?.id === outing.id),
      ),

    addToOuting: async (anchorId, tourId) => {
      const outing = await get().ensureOuting(anchorId);
      if (outing) await setOuting(tourId, get().nextInOuting(outing));
    },

    renameOuting: async (segments, name) => {
      const trimmed = name.trim() || null;
      for (const s of segments) {
        if (s.outing && s.outing.name !== trimmed)
          await setOuting(s.id, { ...s.outing, name: trimmed });
      }
    },

    reorderSegments: async (segments, from, to) => {
      const order = movedSegment(segments, from, to);
      const position = new Map(order.map((s, i) => [s.id, i]));
      const before = get().tours;
      set({
        tours: before.map((t) =>
          t.outing && position.has(t.id)
            ? { ...t, outing: { ...t.outing, position: position.get(t.id)! } }
            : t,
        ),
      });
      try {
        for (const [i, s] of order.entries()) {
          if (s.outing && s.outing.position !== i)
            await setOuting(s.id, { ...s.outing, position: i });
        }
      } catch (error) {
        set({ tours: before });
        throw error;
      }
    },

    connectSegments: async (prev, next) => {
      if (!next.startPoint) return;
      await update(
        prev.id,
        {
          ...tourToDraft(prev),
          endPoint: next.startPoint,
          endPointName: next.startPointName,
          endPointElevation: next.startPointElevation,
        },
        prev.goal,
      );
    },

    removeFromOuting: async (segments, tourId) => {
      await setOuting(tourId, null);
      const rest = segments.filter((s) => s.id !== tourId);
      if (rest.length === 1) await setOuting(rest[0]!.id, null);
    },
  };
});

/** Whether a write may run against the server now (the form's GPX upload asks before it starts). */
export const canWriteOnline = isReachable;
