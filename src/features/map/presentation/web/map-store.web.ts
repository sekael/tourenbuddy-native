import { z } from 'zod';
import { create } from 'zustand';

import { TRAIL_OVERLAYS, type TrailOverlayId } from '@/features/map/data/trail-overlays';
import type { LngLat, Trail } from '@/features/map/domain/entities/trail';
import type { TourType } from '@/features/tours/data/models/tour-type';
import type { TourLegs } from '@/features/tours/domain/legs';
import type { TrackCursor } from '@/features/map/domain/profile-cursor';

// The PWA's key: a user switching from the PWA keeps the overlays they had on (web-app carry-over).
const OVERLAYS_STORAGE_KEY = 'tb.map.overlays';

/** Persisted overlays, filtered to known ids so one stale entry doesn't wipe the rest. */
function readStoredOverlays(): TrailOverlayId[] {
  try {
    const parsed = z
      .array(z.string())
      .safeParse(JSON.parse(localStorage.getItem(OVERLAYS_STORAGE_KEY) ?? '[]'));
    if (parsed.success)
      return TRAIL_OVERLAYS.map((o) => o.id).filter((id) => parsed.data.includes(id));
  } catch {
    // localStorage unavailable or corrupt JSON: all off.
  }
  return [];
}

/** Ski routes found by one tap, nearest first; `selectedId` null = list view. */
export type TrailCard = { candidates: Trail[]; more: number; selectedId: string | null };

/** One stage of the tour being created, as the map draws it. */
export type DraftStage = {
  goal: { lng: number; lat: number } | null;
  startPoint: { lng: number; lat: number } | null;
  endPoint: { lng: number; lat: number } | null;
  tourTypes: TourType[];
  legs: TourLegs | null;
  track: LngLat[] | null;
  active?: boolean;
  label?: string;
};

/**
 * Handoff from the calendar route to the map page, consumed once when the map mounts: a selection
 * or a return to the list survives one navigation without becoming a URL parameter.
 */
export type PendingIntent = {
  openTours?: boolean;
  selectTourId?: string;
  origin?: 'cal-seasons' | 'cal-planned';
  originDay?: string;
  startCalendarTour?: boolean;
};

type Point = { lng: number; lat: number };

type MapState = {
  isPickingLocation: boolean;
  isDrawingTrack: boolean;
  isDrawingRegion: boolean;
  currentStyleIndex: number;
  selectedTourId: string | null;
  selectedOutingKey: string | null;
  previewGoal: Point | null;
  previewTourTypes: TourType[] | null;
  /** The form's ways for those activities (up, down, both); null when they don't differ. */
  previewLegs: TourLegs | null;
  previewStart: Point | null;
  previewEnd: Point | null;
  previewTrack: LngLat[] | null;
  previewStages: DraftStage[];
  /** The place a finger or the mouse on the open tour's elevation profile points at. */
  trackCursor: TrackCursor | null;
  pendingIntent: PendingIntent | null;
  activeOverlays: TrailOverlayId[];
  trailCard: TrailCard | null;
  toggleOverlay: (id: TrailOverlayId) => void;
  showTrails: (candidates: Trail[], more: number) => void;
  selectTrail: (id: string | null) => void;
  clearTrails: () => void;
  setPendingIntent: (intent: PendingIntent) => void;
  consumePendingIntent: () => PendingIntent | null;
  setPickingLocation: (picking: boolean) => void;
  setDrawingTrack: (drawing: boolean) => void;
  setDrawingRegion: (drawing: boolean) => void;
  setStyleIndex: (index: number) => void;
  selectTour: (tourId: string | null) => void;
  selectOuting: (key: string | null) => void;
  setPreviewGoal: (goal: Point | null) => void;
  setPreviewTourTypes: (tourTypes: TourType[] | null, legs?: TourLegs | null) => void;
  setPreviewStart: (start: Point | null) => void;
  setPreviewEnd: (end: Point | null) => void;
  setPreviewTrack: (line: LngLat[] | null) => void;
  setPreviewStages: (stages: DraftStage[]) => void;
};

/** The PWA's map page state (`map-store.ts` there): what the map shows and which mode it is in. */
export const useMapStore = create<MapState>()((set, get) => ({
  isPickingLocation: false,
  isDrawingTrack: false,
  isDrawingRegion: false,
  currentStyleIndex: 0,
  selectedTourId: null,
  selectedOutingKey: null,
  previewGoal: null,
  previewTourTypes: null,
  previewLegs: null,
  previewStart: null,
  previewEnd: null,
  previewTrack: null,
  trackCursor: null,
  previewStages: [],
  pendingIntent: null,
  activeOverlays: readStoredOverlays(),
  trailCard: null,

  toggleOverlay: (id) => {
    const next = new Set(get().activeOverlays);
    if (!next.delete(id)) next.add(id);
    const activeOverlays = TRAIL_OVERLAYS.map((o) => o.id).filter((i) => next.has(i));
    set({ activeOverlays });
    try {
      localStorage.setItem(OVERLAYS_STORAGE_KEY, JSON.stringify(activeOverlays));
    } catch {
      // Not persisted this time; the in-memory choice still applies.
    }
  },
  /** One hit opens its details directly; several open the list. */
  showTrails: (candidates, more) =>
    set({
      trailCard: {
        candidates,
        more,
        selectedId: candidates.length === 1 ? candidates[0]!.id : null,
      },
    }),
  selectTrail: (id) => {
    const card = get().trailCard;
    if (card) set({ trailCard: { ...card, selectedId: id } });
  },
  clearTrails: () => set({ trailCard: null }),
  setPendingIntent: (pendingIntent) => set({ pendingIntent }),
  consumePendingIntent: () => {
    const intent = get().pendingIntent;
    set({ pendingIntent: null });
    return intent;
  },
  setPickingLocation: (picking) =>
    set(
      picking ? { isPickingLocation: true } : { isPickingLocation: false, isDrawingTrack: false },
    ),
  setDrawingTrack: (drawing) => set({ isDrawingTrack: drawing, isPickingLocation: drawing }),
  setDrawingRegion: (isDrawingRegion) => set({ isDrawingRegion }),
  setStyleIndex: (currentStyleIndex) => set({ currentStyleIndex }),
  selectTour: (tourId) =>
    set(tourId ? { selectedTourId: tourId, selectedOutingKey: null } : { selectedTourId: null }),
  selectOuting: (key) =>
    set(key ? { selectedOutingKey: key, selectedTourId: null } : { selectedOutingKey: null }),
  setPreviewGoal: (previewGoal) => set({ previewGoal }),
  setPreviewTourTypes: (previewTourTypes, previewLegs = null) =>
    set({ previewTourTypes, previewLegs }),
  setPreviewStart: (previewStart) => set({ previewStart }),
  setPreviewEnd: (previewEnd) => set({ previewEnd }),
  setPreviewTrack: (previewTrack) => set({ previewTrack }),
  setPreviewStages: (previewStages) => set({ previewStages }),
}));
