import { create } from 'zustand';

import { getCached, putCached } from '@/core/offline/entity-cache';
import { TRAIL_OVERLAYS, type TrailOverlayId } from '@/features/map/data/trail-overlays';
import type { LngLat, Trail } from '@/features/map/domain/entities/trail';
import type { TourType } from '@/features/tours/data/models/tour-type';
import type { TourLegs } from '@/features/tours/domain/legs';

/**
 * The map's state, ported from the PWA's map store: base map, overlays (kept on the device), the
 * selection, what the open form previews, and the mode the live map is in (D4): browsing, the
 * route step or a point pick (`plan` sheet), drawing a track (`draw` sheet), or a region for
 * offline maps.
 */
export type MapMode = 'browse' | 'route' | 'pick' | 'draw' | 'region';

/** Ski routes found by one tap, nearest first; `selectedId` null = the list. */
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

/** Where to put the camera next: the map component consumes it once. */
export type CameraRequest =
  { kind: 'fly'; center: LngLat; zoom?: number } | { kind: 'fit'; bounds: [LngLat, LngLat] };

type MapState = {
  mode: MapMode;
  styleIndex: number;
  overlays: TrailOverlayId[];
  selectedTourId: string | null;
  selectedOutingKey: string | null;
  previewGoal: { lng: number; lat: number } | null;
  previewTourTypes: TourType[] | null;
  previewStart: { lng: number; lat: number } | null;
  previewEnd: { lng: number; lat: number } | null;
  previewTrack: LngLat[] | null;
  previewStages: DraftStage[];
  trailCard: TrailCard | null;
  /** Tours sharing one spot, from a stack tap: the stack list sheet shows them. */
  stack: string[] | null;
  camera: CameraRequest | null;
  /** The map's visible centre, kept for picks that start "here" and for offline regions. */
  center: LngLat | null;
  zoom: number | null;
  bounds: [number, number, number, number] | null;
  /** Height the open sheet covers at the bottom, so the camera frames tours above it. */
  bottomInset: number;
  /** While a step runs (route, pick, draw, region), map taps go to it instead of the tours. */
  tapHandler: ((lngLat: LngLat) => void) | null;
  /** A step's own lines and points (legs, a drawn track, its stops); null = the open tour's. */
  previewLines: GeoJSON.FeatureCollection<
    GeoJSON.LineString,
    { color: string; width?: number; dashed?: boolean; casing?: boolean }
  > | null;
  previewPoints: GeoJSON.FeatureCollection<
    GeoJSON.Point,
    { kind: 'start' | 'end' | 'preview'; color?: string; label?: string }
  > | null;

  setMode: (mode: MapMode) => void;
  setStyleIndex: (index: number) => void;
  toggleOverlay: (id: TrailOverlayId) => void;
  restoreOverlays: () => Promise<void>;
  selectTour: (id: string | null) => void;
  selectOuting: (key: string | null) => void;
  setPreview: (
    preview: Partial<
      Pick<
        MapState,
        | 'previewGoal'
        | 'previewTourTypes'
        | 'previewStart'
        | 'previewEnd'
        | 'previewTrack'
        | 'previewStages'
      >
    >,
  ) => void;
  clearPreview: () => void;
  showTrails: (candidates: Trail[], more: number) => void;
  selectTrail: (id: string | null) => void;
  clearTrails: () => void;
  showStack: (ids: string[] | null) => void;
  requestCamera: (request: CameraRequest) => void;
  consumeCamera: () => CameraRequest | null;
  /** `bounds`: west, south, east, north of what the map shows. */
  setView: (center: LngLat, zoom: number, bounds?: [number, number, number, number]) => void;
  setBottomInset: (height: number) => void;
  /** Enters a step: its tap handler and what it draws; `endStep` returns to browsing. */
  beginStep: (mode: Exclude<MapMode, 'browse'>, tapHandler: (lngLat: LngLat) => void) => void;
  endStep: () => void;
};

const OVERLAYS_KEY = 'map-overlays:device';

const noPreview = {
  previewGoal: null,
  previewTourTypes: null,
  previewStart: null,
  previewEnd: null,
  previewTrack: null,
  previewStages: [],
};

export const useMapStore = create<MapState>()((set, get) => ({
  mode: 'browse',
  styleIndex: 0,
  overlays: [],
  selectedTourId: null,
  selectedOutingKey: null,
  ...noPreview,
  trailCard: null,
  stack: null,
  camera: null,
  center: null,
  zoom: null,
  bounds: null,
  bottomInset: 0,
  tapHandler: null,
  previewLines: null,
  previewPoints: null,

  setMode: (mode) => set({ mode }),
  setStyleIndex: (styleIndex) => set({ styleIndex }),

  toggleOverlay: (id) => {
    const next = new Set(get().overlays);
    if (!next.delete(id)) next.add(id);
    // Kept in draw order, whatever order they were switched on.
    const overlays = TRAIL_OVERLAYS.map((o) => o.id).filter((i) => next.has(i));
    set({ overlays });
    void putCached(OVERLAYS_KEY, overlays).catch(() => {});
  },

  restoreOverlays: async () => {
    const stored = await getCached<string[]>(OVERLAYS_KEY).catch(() => undefined);
    if (!Array.isArray(stored)) return;
    // Unknown ids (an older build's) are dropped, never the whole choice.
    set({ overlays: TRAIL_OVERLAYS.map((o) => o.id).filter((id) => stored.includes(id)) });
  },

  selectTour: (selectedTourId) =>
    set(selectedTourId ? { selectedTourId, selectedOutingKey: null } : { selectedTourId }),
  selectOuting: (selectedOutingKey) =>
    set(selectedOutingKey ? { selectedOutingKey, selectedTourId: null } : { selectedOutingKey }),
  setPreview: (preview) => set(preview),
  clearPreview: () => set(noPreview),

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
  showStack: (stack) => set({ stack }),

  requestCamera: (camera) => set({ camera }),
  consumeCamera: () => {
    const { camera } = get();
    if (camera) set({ camera: null });
    return camera;
  },
  setView: (center, zoom, bounds) => set({ center, zoom, bounds: bounds ?? null }),
  setBottomInset: (bottomInset) => set({ bottomInset }),
  beginStep: (mode, tapHandler) => set({ mode, tapHandler }),
  endStep: () =>
    set({
      mode: 'browse',
      tapHandler: null,
      previewLines: null,
      previewPoints: null,
      ...noPreview,
    }),
}));
