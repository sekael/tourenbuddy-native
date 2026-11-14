import { create } from 'zustand';

import { newId } from '@/core/files';
import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { RoutePlan, RoutePoints } from '@/features/map/domain/route-plan';
import type { Follow } from '@/features/map/domain/snap-network';
import { seasonsForDates } from '@/features/tours/data/models/season';
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service';
import { suggestTourName } from '@/features/tours/data/services/swisstopo-name-service';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { Tour, TourDraft } from '@/features/tours/domain/entities/tour';
import { onSkis } from '@/features/tours/domain/route-metrics';

import { tourToDraft } from './tours-store';

/**
 * The tour being created or edited (tour-form-extended "Location pick preserves unsaved form
 * edits", D4): the form, the route step and the drawing are separate screens over the live map,
 * and this store carries every field across them, so leaving the form for a step and coming back
 * shows it exactly as it was. Nothing is saved until the form's Save.
 */
export type DraftMode = 'create' | 'edit' | 'suggest';

/** A new track waiting for Save: GPX text from a file, the planned route or a drawing. */
export type PendingTrack = {
  text: string;
  /** Shown in the form: a file's name, or "Drawn track · 8.4 km". */
  label: string;
  /** The line, for the map and for the drawing to go on from. */
  line: LngLat[];
  /** The drawing it came from, kept so "Edit on map" continues it. */
  drawing: DrawnTrack | null;
};

export const emptyDraft = (): TourDraft => ({
  name: null,
  plannedDate: null,
  endDate: null,
  partnerIds: [],
  tourTypes: [],
  elevation: null,
  gpxFilepath: null,
  description: null,
  seasons: null,
  startPoint: null,
  endPoint: null,
  startPointName: null,
  startPointElevation: null,
  endPointName: null,
  endPointElevation: null,
  equipment: null,
  notes: null,
  grade: null,
  startTime: null,
  visibility: 'friends',
});

type DraftState = {
  mode: DraftMode | null;
  /** The tour edited, or (create) the id minted up front, so files can upload before Save. */
  tourId: string | null;
  /** Keys this draft's pre-uploaded attachments. */
  draftId: string;
  draft: TourDraft;
  goal: { lng: number; lat: number } | null;
  /** The goal's own name and height from the route step, for an empty name field. */
  track: PendingTrack | null;
  gpxRemoved: boolean;
  /** Something changed since the draft began: closing asks first. */
  dirty: boolean;
  /** The user picked the activities (the form): a line's network no longer changes them. */
  typesChosen: boolean;
  /** Where the step should continue: the route planned so far. */
  route: RoutePlan | null;
  /** Anchor of a new segment (Add segment): saved into its outing. */
  segmentOf: string | null;
  /** The tour whose sheet closed so its route could be edited on the map: reopened after. */
  returnTo: string | null;
  begin: (mode: DraftMode, tour?: Tour | null, seed?: Partial<TourDraft>) => void;
  update: (patch: Partial<TourDraft>) => void;
  setRoute: (plan: RoutePlan) => void;
  setTrack: (track: PendingTrack | null) => void;
  /**
   * The route's start and end where its track begins and ends (null: none), so a tour never shows
   * a second end: a point that moved is named and measured anew, one that stayed keeps its name.
   */
  setEnds: (start: LngLat | null, end: LngLat | null) => void;
  /** The line follows `follow`: an activity the user has not picked follows it (ski routes, ski tour). */
  followed: (follow: Follow) => void;
  removeTrack: () => void;
  setSegmentOf: (id: string | null) => void;
  reset: () => void;
};

const point = (p: RoutePoints['start']) => (p ? { ...p.location } : null);

export const useTourDraftStore = create<DraftState>()((set, get) => ({
  mode: null,
  tourId: null,
  draftId: newId(),
  draft: emptyDraft(),
  goal: null,
  track: null,
  gpxRemoved: false,
  dirty: false,
  typesChosen: false,
  route: null,
  segmentOf: null,
  returnTo: null,

  begin: (mode, tour = null, seed = {}) =>
    set({
      mode,
      tourId: tour?.id ?? newId(),
      draftId: newId(),
      draft: { ...(tour ? tourToDraft(tour) : emptyDraft()), ...seed },
      goal: tour ? { ...tour.goal } : null,
      track: null,
      gpxRemoved: false,
      dirty: false,
      typesChosen: !!tour?.tourTypes.length,
      route: null,
      segmentOf: null,
      returnTo: null,
    }),

  update: (patch) =>
    set((s) => {
      const draft = { ...s.draft, ...patch };
      // Seasons follow the dates while the user has not chosen them (tour-form-extended).
      if (('plannedDate' in patch || 'endDate' in patch) && !('seasons' in patch)) {
        const auto = seasonsForDates(draft.plannedDate, draft.endDate);
        const before = seasonsForDates(s.draft.plannedDate, s.draft.endDate);
        const untouched = !s.draft.seasons?.length || same(s.draft.seasons, before);
        if (untouched) draft.seasons = auto.length ? auto : s.draft.seasons;
      }
      return { draft, dirty: true, typesChosen: s.typesChosen || 'tourTypes' in patch };
    }),

  setRoute: (plan) =>
    set((s) => {
      const { start, goal, end } = plan.points;
      const draft: TourDraft = {
        ...s.draft,
        startPoint: point(start),
        startPointName: start?.name ?? null,
        startPointElevation: start?.elevation ?? null,
        endPoint: point(end),
        endPointName: end?.name ?? null,
        endPointElevation: end?.elevation ?? null,
      };
      // The goal names an empty tour and gives its height (the route step looked both up).
      if (goal) {
        if (!draft.name?.trim() && goal.name) draft.name = goal.name;
        if (
          goal.elevation != null &&
          (draft.elevation == null || !sameSpot(s.goal, goal.location))
        ) {
          draft.elevation = goal.elevation;
        }
      }
      return {
        draft,
        goal: goal ? { ...goal.location } : s.goal,
        route: plan,
        dirty: true,
      };
    }),

  setTrack: (track) => set({ track, gpxRemoved: false, dirty: true }),

  setEnds: (start, end) => {
    const draft = get().draft;
    const moved = (was: Spot | null, at: LngLat | null): Spot | null | undefined => {
      const next = at ? { lng: at[0], lat: at[1] } : null;
      if (was && next ? isSameGoal(was, next, KEEP_NAME_M) : was === next) return undefined;
      return next;
    };
    const s = moved(draft.startPoint, start);
    const e = moved(draft.endPoint, end);
    if (s === undefined && e === undefined) return;
    set((state) => ({
      draft: {
        ...state.draft,
        ...(s !== undefined
          ? { startPoint: s, startPointName: null, startPointElevation: null }
          : {}),
        ...(e !== undefined ? { endPoint: e, endPointName: null, endPointElevation: null } : {}),
      },
      dirty: true,
    }));
    const lookUp = (at: Spot, apply: (name: string | null, elevation: number | null) => void) =>
      void Promise.all([
        suggestTourName(at).catch(() => null),
        getElevation(at).catch(() => null),
      ]).then(([name, elevation]) => apply(name, elevation));
    if (s)
      lookUp(s, (startPointName, startPointElevation) => {
        if (get().draft.startPoint !== s) return;
        set((state) => ({ draft: { ...state.draft, startPointName, startPointElevation } }));
      });
    if (e)
      lookUp(e, (endPointName, endPointElevation) => {
        if (get().draft.endPoint !== e) return;
        set((state) => ({ draft: { ...state.draft, endPointName, endPointElevation } }));
      });
  },

  followed: (follow) =>
    set((s) => {
      const types = s.draft.tourTypes;
      if (s.typesChosen || follow === 'straight' || (follow === 'ski') === onSkis(types)) return {};
      return { draft: { ...s.draft, tourTypes: follow === 'ski' ? ['skitour'] : ['hiking'] } };
    }),

  removeTrack: () => set((s) => ({ track: null, gpxRemoved: !!s.draft.gpxFilepath, dirty: true })),
  setSegmentOf: (segmentOf) => set({ segmentOf }),
  reset: () =>
    set({
      mode: null,
      tourId: null,
      draftId: newId(),
      draft: emptyDraft(),
      goal: null,
      track: null,
      gpxRemoved: false,
      dirty: false,
      typesChosen: false,
      route: null,
      segmentOf: null,
      returnTo: null,
    }),
}));

type Spot = { lng: number; lat: number };
/** A start or end this close to where it was keeps its name and height. */
const KEEP_NAME_M = 50;

function same(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function sameSpot(a: { lng: number; lat: number } | null, b: { lng: number; lat: number }) {
  return !!a && Math.abs(a.lng - b.lng) < 1e-6 && Math.abs(a.lat - b.lat) < 1e-6;
}
