import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { TourDraft } from '@/features/tours/domain/entities/tour';

import type { PointChange } from './use-swisstopo-fill.web';

/** One stage (one day) of a tour being created. */
export type CreationStage = {
  /** Stable for the stage's life: its form stays mounted under it. */
  key: string;
  goal: { lng: number; lat: number };
  /** The form's first values: the next day's seed, a planned ski route's facts. */
  seed: TourDraft | null;
  /** The latest points for the form (a new list per hand-over). */
  picks: PointChange[] | null;
  /** The latest drawing (or a planned route's line) for the form to take as its track. */
  drawnTrack: DrawnTrack | null;
};

/** What saving one stage sends. */
export type StagePayload = {
  draft: TourDraft;
  goal: { lng: number; lat: number };
  preUploadedTourId: string | null;
  draftId: string;
};

/** A start or end as the form holds it. */
export type RoutePoint = {
  location: { lng: number; lat: number };
  name: string | null;
  elevation: number | null;
};

/** One stage's points as its form holds them, for the route planner (map-first-tour-creation D3). */
export type StageRoute = {
  /** Named by its place where the form knows it (`place`), else by the tour. */
  goal: { name: string | null; elevation: number | null; place?: string | null };
  start: RoutePoint | null;
  end: RoutePoint | null;
  /** The drawn track (or a planned route's line), to go on from. */
  drawing: DrawnTrack | null;
  /** An uploaded track, which stays as it is. */
  fixedLine: LngLat[] | null;
};
