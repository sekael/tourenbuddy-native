import { create } from 'zustand';

import { newId } from '@/core/files';
import type { Follows } from '@/features/map/domain/snap-network';
import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { RoutePlan, RoutePoints } from '@/features/map/domain/route-plan';
import { seasonsForDates } from '@/features/tours/data/models/season';
import { TOUR_TYPE_VALUES, type TourType } from '@/features/tours/data/models/tour-type';
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service';
import { suggestTourName } from '@/features/tours/data/services/swisstopo-name-service';
import { isSameGoal } from '@/features/tours/domain/distance';
import { carriedForward, nextSegmentSeed } from '@/features/tours/domain/outing';
import type { Tour, TourDraft } from '@/features/tours/domain/entities/tour';
import {
  chosenDirection,
  chosenLegs,
  choicesOf,
  type LegChoices,
  type LegDirection,
} from '@/features/tours/domain/legs';

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
  /**
   * What each way followed when it was planned on the map, so a change of activities routes it
   * anew (`useReplannedTrack`); absent for a file, or a line drawn straight by choice.
   */
  follows?: Follows | null;
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
  /** The ways up and down the user picked; the draft's legs follow them as activities change. */
  legChoices: LegChoices;
  /** Where the step should continue: the route planned so far. */
  route: RoutePlan | null;
  /** Anchor of a new segment (Add segment): saved into its outing. */
  segmentOf: string | null;
  /** The tour whose sheet closed so its route could be edited on the map: reopened after. */
  returnTo: string | null;
  /**
   * Every day of a trip laid out before its first save (tour-outings "Lay out stages before the
   * first save"); empty for one tour. The active day's entry is stale: the fields above hold it.
   */
  stages: DraftDay[];
  active: number;
  /** The days a span split into daily stages has ("Day 2 of 3"), counted from the outing's first. */
  dayCount: number | null;
  begin: (mode: DraftMode, tour?: Tour | null, seed?: Partial<TourDraft>) => void;
  update: (patch: Partial<TourDraft>) => void;
  /** An activity on or off; each activity keeps the way picked for it, a new one takes its default. */
  toggleType: (type: TourType) => void;
  /** The way one activity goes: start → goal, both, or goal → end. */
  setWay: (type: TourType, way: LegDirection) => void;
  setRoute: (plan: RoutePlan) => void;
  setTrack: (track: PendingTrack | null) => void;
  /**
   * The route's start and end where its track begins and ends (null: none), so a tour never shows
   * a second end: a point that moved is named and measured anew, one that stayed keeps its name.
   */
  setEnds: (start: LngLat | null, end: LngLat | null) => void;
  removeTrack: () => void;
  setSegmentOf: (id: string | null) => void;
  /** Every day as it is now: the one tour, or each day of the trip in order. */
  days: () => DraftDay[];
  /** A day after the last, seeded from it (starting where it ends, the day after), on screen. */
  nextDay: () => void;
  selectDay: (index: number) => void;
  /** Drops a later day; the one before it shows. */
  removeDay: (index: number) => void;
  reset: () => void;
};

/** One day of a trip laid out before its first save: what is each tour's own. */
export type DraftDay = Pick<
  DraftState,
  | 'tourId'
  | 'draftId'
  | 'draft'
  | 'goal'
  | 'track'
  | 'gpxRemoved'
  | 'dirty'
  | 'legChoices'
  | 'route'
>;

const dayOf = (s: DraftDay): DraftDay => ({
  tourId: s.tourId,
  draftId: s.draftId,
  draft: s.draft,
  goal: s.goal,
  track: s.track,
  gpxRemoved: s.gpxRemoved,
  dirty: s.dirty,
  legChoices: s.legChoices,
  route: s.route,
});

/** The draft with `patch` applied; the seasons follow the dates while the user hasn't chosen them. */
function withSeasons(before: TourDraft, patch: Partial<TourDraft>): TourDraft {
  const draft = { ...before, ...patch };
  if (('plannedDate' in patch || 'endDate' in patch) && !('seasons' in patch)) {
    const auto = seasonsForDates(draft.plannedDate, draft.endDate);
    const was = seasonsForDates(before.plannedDate, before.endDate);
    const untouched = !before.seasons?.length || same(before.seasons, was);
    if (untouched) draft.seasons = auto.length ? auto : before.seasons;
  }
  return draft;
}

/** The later days, once the active one changed to `draft` (D11: what they still shared follows). */
function carried(s: DraftState, draft: TourDraft): Partial<DraftState> {
  if (s.stages.length < 2) return {};
  const patches = carriedForward(
    s.stages.map((day, i) => (i === s.active ? draft : day.draft)),
    s.active,
    s.draft,
  );
  if (!patches.some(Boolean)) return {};
  return {
    stages: s.stages.map((day, j) => {
      const patch = patches[j];
      if (!patch) return day;
      const next = withSeasons(day.draft, patch);
      if (patch.tourTypes) next.legs = chosenLegs(next.tourTypes, day.legChoices);
      return { ...day, draft: next };
    }),
  };
}

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
  legChoices: {},
  route: null,
  segmentOf: null,
  returnTo: null,
  stages: [],
  active: 0,
  dayCount: null,

  begin: (mode, tour = null, seed = {}) => {
    const draft = { ...(tour ? tourToDraft(tour) : emptyDraft()), ...seed };
    set({
      mode,
      tourId: tour?.id ?? newId(),
      draftId: newId(),
      draft,
      legChoices: choicesOf(draft),
      goal: tour ? { ...tour.goal } : null,
      track: null,
      gpxRemoved: false,
      dirty: false,
      route: null,
      segmentOf: null,
      returnTo: null,
      stages: [],
      active: 0,
      dayCount: null,
    });
  },

  update: (patch) =>
    set((s) => {
      // Seasons follow the dates while the user has not chosen them (tour-form-extended).
      const draft = withSeasons(s.draft, patch);
      return { draft, dirty: true, ...carried(s, draft) };
    }),

  toggleType: (type) =>
    set((s) => {
      const types = s.draft.tourTypes;
      const next = TOUR_TYPE_VALUES.filter((v) =>
        v === type ? !types.includes(v) : types.includes(v),
      );
      const draft = { ...s.draft, tourTypes: next, legs: chosenLegs(next, s.legChoices) };
      return { draft, dirty: true, ...carried(s, draft) };
    }),

  setWay: (type, way) =>
    set((s) => {
      const types = s.draft.tourTypes;
      // A tap pins every line as shown, so later activities never move the ones seen.
      const shown = Object.fromEntries(
        types.map((t) => [t, chosenDirection(types, s.legChoices, t)]),
      );
      const legChoices = { ...s.legChoices, ...shown, [type]: way };
      return {
        legChoices,
        draft: { ...s.draft, legs: chosenLegs(types, legChoices) },
        dirty: true,
      };
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
    if (s)
      lookUpPlace(s, (startPointName, startPointElevation) => {
        if (get().draft.startPoint !== s) return;
        set((state) => ({ draft: { ...state.draft, startPointName, startPointElevation } }));
      });
    if (e)
      lookUpPlace(e, (endPointName, endPointElevation) => {
        if (get().draft.endPoint !== e) return;
        set((state) => ({ draft: { ...state.draft, endPointName, endPointElevation } }));
      });
  },

  removeTrack: () => set((s) => ({ track: null, gpxRemoved: !!s.draft.gpxFilepath, dirty: true })),
  setSegmentOf: (segmentOf) => set({ segmentOf }),

  days: () => {
    const s = get();
    return s.stages.length
      ? s.stages.map((day, i) => (i === s.active ? dayOf(s) : day))
      : [dayOf(s)];
  },

  nextDay: () => {
    const days = get().days();
    const last = days.at(-1)!;
    if (!last.goal) return;
    // Starting at the goal, the day takes the goal's place name, not the tour's.
    const place = last.route?.points.goal?.name;
    const draft: TourDraft = {
      ...emptyDraft(),
      ...nextSegmentSeed({ ...last.draft, name: place ?? last.draft.name, goal: last.goal }),
    };
    const day: DraftDay = {
      tourId: newId(),
      draftId: newId(),
      draft,
      goal: null,
      track: null,
      gpxRemoved: false,
      dirty: true,
      legChoices: choicesOf(draft),
      route: null,
    };
    set({ stages: [...days, day], active: days.length, ...day });
    // The day before ended at a spot without a name: the start is named and measured.
    const start = draft.startPoint;
    if (start && !draft.startPointName) {
      lookUpPlace(start, (startPointName, elevation) => {
        if (get().draft.startPoint !== start) return;
        set((st) => ({
          draft: {
            ...st.draft,
            startPointName,
            startPointElevation: st.draft.startPointElevation ?? elevation,
          },
        }));
      });
    }
  },

  selectDay: (index) => {
    const days = get().days();
    if (!days[index]) return;
    set({ stages: days, active: index, ...days[index] });
  },

  removeDay: (index) => {
    const days = get().days();
    if (index <= 0 || !days[index]) return;
    const kept = days.filter((_, i) => i !== index);
    const active = Math.min(index - 1, kept.length - 1);
    set({
      stages: kept.length > 1 ? kept : [],
      active: kept.length > 1 ? active : 0,
      ...kept[active]!,
    });
  },

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
      legChoices: {},
      route: null,
      segmentOf: null,
      returnTo: null,
      stages: [],
      active: 0,
      dayCount: null,
    }),
}));

/** The first day a save can't take (no name, no goal, ends before it starts), or -1. */
export function firstUnsavableDay(days: readonly DraftDay[]): number {
  return days.findIndex(
    ({ draft, goal }) =>
      !draft.name?.trim() ||
      !goal ||
      (!!draft.endDate && !!draft.plannedDate && draft.endDate < draft.plannedDate),
  );
}

/** A spot's place name and height, looked up together. */
function lookUpPlace(at: Spot, apply: (name: string | null, elevation: number | null) => void) {
  void Promise.all([
    suggestTourName(at).catch(() => null),
    getElevation(at).catch(() => null),
  ]).then(([name, elevation]) => apply(name, elevation));
}

type Spot = { lng: number; lat: number };
/** A start or end this close to where it was keeps its name and height. */
const KEEP_NAME_M = 50;

function same(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function sameSpot(a: { lng: number; lat: number } | null, b: { lng: number; lat: number }) {
  return !!a && Math.abs(a.lng - b.lng) < 1e-6 && Math.abs(a.lat - b.lat) < 1e-6;
}
