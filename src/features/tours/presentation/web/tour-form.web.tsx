import {
  useEffect,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { newId } from '@/core/files';
import { evictCachedFile } from '@/core/offline/file-cache';
import { isOnline } from '@/core/offline/online';
import { discardStaged, stageText } from '@/core/offline/staged-files';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import { usePace } from '@/core/web/use-pace.web';
import { useReactive } from '@/core/web/use-reactive.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { ContactChip } from '@/features/contacts/presentation/web/contact-chip.web';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import {
  lineLength,
  routeStops,
  trackFromLine,
  trackLine,
  withWayBack,
  type DrawnTrack,
} from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import {
  dropScales,
  GRADE_MAX_LENGTH,
  gradeScales,
  normalizeGrade,
} from '@/features/tours/data/models/grade';
import { SEASON_VALUES, seasonsForDates, type Season } from '@/features/tours/data/models/season';
import { MAX_ATTACHMENTS_PER_TOUR } from '@/features/tours/data/models/tour-attachment';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
  TOUR_TYPE_VALUES,
  type TourType,
} from '@/features/tours/data/models/tour-type';
import { DEFAULT_VISIBILITY, type Visibility } from '@/features/tours/data/models/visibility';
import {
  GpxFileTooLargeError,
  GpxParseError,
  parseGpxFile,
} from '@/features/tours/data/services/gpx-parser';
import {
  gpxStorageKey,
  removeGpx,
  uploadGpx,
  uploadGpxToKey,
} from '@/features/tours/data/services/gpx-storage-service';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import { gpxFromLine } from '@/features/tours/data/services/gpx-writer';
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service';
import { suggestTourName } from '@/features/tours/data/services/swisstopo-name-service';
import { densify, getTrackProfile } from '@/features/tours/data/services/swisstopo-profile-service';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { TourDraft } from '@/features/tours/domain/entities/tour';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';
import {
  defaultDirection,
  directionOf,
  landsByAir,
  legsFrom,
  waysCovered,
  type LegDirection,
  type TourLegs,
} from '@/features/tours/domain/legs';
import {
  tourMinutes,
  trackEnds,
  trackLines,
  trackMetrics,
  type RouteMetrics,
} from '@/features/tours/domain/route-metrics';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';

import { ActivityLegs } from './activity-legs.web';
import type { StageRoute } from './creation-stages.web';
import { GradeChips } from './grade-chips.web';
import { PointDistance } from './point-distance.web';
import { PointSuggestions } from './point-suggestions.web';
import { RouteNumbers } from './route-numbers.web';
import { TourAttachmentsPicker } from './tour-attachments-picker.web';
import styles from './tour-form.module.css';
import { UploadTile } from './upload-tile.web';
import {
  useSwisstopoFill,
  type PointChange,
  type PointPick,
  type SwisstopoFill,
} from './use-swisstopo-fill.web';

const c = classes(styles);
type Point = { lng: number; lat: number };

/** What saving would send. */
export type TourFormOutput = {
  draft: TourDraft;
  gpxRemoved: boolean;
  preUploadedTourId: string | null;
  draftId: string;
  /** Suggest mode only: ids of existing attachments proposed for removal (D3). */
  proposedRemovals: string[];
};

/** What the later days of a trip take over from this one while they hold the same (D11). */
export type TourFormShared = {
  tourTypes: TourType[];
  partnerIds: string[];
  visibility: Visibility;
};

/**
 * The form's state a host reads while it renders (Vue's exposed refs): the creation dialog's
 * tabs, its shared-field follow-ups and the Save buttons outside the form.
 */
export type TourFormPublic = {
  tourName: string;
  plannedDate: string;
  shared: TourFormShared;
  /** Where the day ends: its end, else its goal (the next day of a trip starts there, D11). */
  handover: { location: Point; name: string; elevation: number | null } | null;
  submitBlocked: boolean;
};

export type TourFormHandle = {
  /** The in-form Cancel: cleanup, then `onCancel`. */
  cancel: () => void;
  /** Abandon the draft: abort and delete what it uploaded. */
  discard: () => void;
  collect: (focus?: boolean) => TourFormOutput | null;
  snapshot: () => TourDraft;
  route: () => StageRoute;
  adopt: (values: Partial<TourFormShared & { plannedDate: string }>) => void;
};

const NEAR_M = 200;
const isoDay = (date: Date | null | undefined) => (date ? date.toISOString().split('T')[0]! : '');
const height = (value: string) => (value ? Number(value) : null);
const formatPoint = (point: Point) => `${point.lat.toFixed(4)}°N, ${point.lng.toFixed(4)}°E`;

/**
 * The PWA's tour form (`tour-form.vue`): create, edit and suggest share it. A picked or drawn GPX
 * uploads at once (or stages offline), attachments pre-upload in create mode (design D5), and the
 * host reads its state through `onPublic` and acts on it through the `ref` handle.
 */
export function TourForm({
  submitLabel,
  allowGoalEdit,
  currentGoal,
  initialDraft,
  pick,
  drawnTrack,
  disabled,
  tourId,
  formId,
  embedded,
  mode,
  idPrefix = 'tf',
  stages,
  hidden,
  end,
  onSubmit,
  onCancel,
  onPickPoint,
  onDrawTrack,
  onTrackChange,
  onTourTypesChange,
  onStartPointChange,
  onEndPointChange,
  onNextDay,
  onPublic,
  ref,
}: {
  /** Label for the submit button. */
  submitLabel: string;
  /** The goal row shows a "Change" button that asks for a goal pick. */
  allowGoalEdit?: boolean;
  /** Current goal coordinates, controlled by the parent. */
  currentGoal?: Point | null;
  /** Seeds all editable fields (edit mode, or a new outing segment's create). */
  initialDraft?: TourDraft | null;
  /** The latest confirmed location pick (a new object per pick), or a list from the route planner. */
  pick?: PointChange | PointChange[] | null;
  /** The latest finished drawing (a new object per drawing), or a planned ski route's line. */
  drawnTrack?: DrawnTrack | null;
  /** Disables all inputs and buttons, while the location picker is active. */
  disabled?: boolean;
  /** Tour id: edit (and suggest) mode only. */
  tourId?: string;
  /** `<form>` id, so an external Save button can submit via the `form` attribute. */
  formId?: string;
  /** Hide the in-form cancel/save row: the page's top bar has them. */
  embedded?: boolean;
  /** `suggest` composes a proposal on a friend's tour: the non-suggestable controls hide (D2). */
  mode?: 'edit' | 'suggest';
  /** Prefix of the field ids, unique per form on screen. */
  idPrefix?: string;
  /** Create mode: offer "+ Next day" and "Split into daily stages" (D4, D5). */
  stages?: boolean;
  /** Kept mounted but not shown (another day's form is on screen). */
  hidden?: boolean;
  /** The host's last word on this form, e.g. a trip's "Remove day 2". */
  end?: ReactNode;
  onSubmit?: (out: TourFormOutput) => void;
  onCancel?: () => void;
  onPickPoint?: (type: 'start' | 'end' | 'goal') => void;
  /** Draw the track on the map, going on from the current one (null: none yet). */
  onDrawTrack?: (seed: DrawnTrack | null) => void;
  /** The unsaved track for the map: null = the saved one stands, [] = removed. */
  onTrackChange?: (line: LngLat[] | null) => void;
  onTourTypesChange?: (tourTypes: TourType[]) => void;
  onStartPointChange?: (point: Point | null) => void;
  onEndPointChange?: (point: Point | null) => void;
  /** Plan the next day's stage from here; `split`: the days a span covered, now day 1 of them. */
  onNextDay?: (split?: number) => void;
  onPublic?: (state: TourFormPublic) => void;
  ref?: React.Ref<TourFormHandle>;
}) {
  'use no memo';
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string, params?: Record<string, unknown>) => string;
  const { formatDistance } = useFormatter();
  const pace = usePace();
  const contacts = useContactsStore((st) => st.contacts);
  const attachmentsByTour = useTourAttachmentsStore((st) => st.attachmentsByTour);
  const stagedByDraft = useTourAttachmentsStore((st) => st.stagedByDraft);
  const preUploadedByDraft = useTourAttachmentsStore((st) => st.preUploadedByDraft);
  /** A failed upload is settled, so it must NOT block Save (design D6). */
  const attachmentsUploading = useTourAttachmentsStore((st) =>
    Object.values(st.pendingByTour).some((list) => list.some((p) => p.status === 'uploading')),
  );
  /** The latest props, for async continuations. */
  const live = useRef({ currentGoal, tourId });
  live.current = { currentGoal, tourId };

  /** Fixed for the lifetime of a form instance: the host mounts a fresh one per mode. */
  const isSuggest = mode === 'suggest';
  const init = initialDraft;

  // ── Internal form state ────────────────────────────────────────────────────
  const s = useReactive(() => {
    const plannedDate = isoDay(init?.plannedDate);
    const endDate = isoDay(init?.endDate);
    const seasons = new Set<Season>(init?.seasons ?? []);
    const dated = plannedDate
      ? seasonsForDates(new Date(plannedDate), endDate ? new Date(endDate) : null)
      : seasonsForDates(null, null);
    const types = init?.tourTypes ?? [];
    return {
      tourName: init?.name ?? '',
      plannedDate,
      /** Span end, optional. Empty = single-day tour. */
      endDate,
      endDateError: false,
      /** "HH:MM" on the planned date; empty = none (design D4). */
      startTime: init?.startTime ?? '',
      selectedPartnerIds: new Set<string>(init?.partnerIds ?? []),
      visibility: init?.visibility ?? DEFAULT_VISIBILITY,
      selectedTourTypes: types,
      elevation: init?.elevation != null ? String(init.elevation) : '',
      description: init?.description ?? '',
      selectedSeasons: seasons,
      /** Free text, one part per activity scale (design D3). */
      grade: init?.grade ?? '',
      startPoint: (init?.startPoint ?? null) as Point | null,
      endPoint: (init?.endPoint ?? null) as Point | null,
      startPointName: init?.startPointName ?? '',
      startPointElevation:
        init?.startPointElevation != null ? String(init.startPointElevation) : '',
      endPointName: init?.endPointName ?? '',
      endPointElevation: init?.endPointElevation != null ? String(init.endPointElevation) : '',
      /** "Set by hand" opened start and end while both are empty. */
      pointsByHand: false,
      equipment: init?.equipment ?? '',
      notes: init?.notes ?? '',
      gpxFile: null as File | null,
      /** A drawing on its way to a GPX file: heights load from the terrain profile first. */
      preparingTrack: false,
      /** The saved track loading to draw on from it. */
      loadingSeed: false,
      gpxFilepath: init?.gpxFilepath ?? null,
      gpxRemoved: false,
      gpxError: null as string | null,
      nameError: false,
      pendingGpxKey: null as string | null,
      pendingTourId: null as string | null,
      isUploadingGpx: false,
      /** Fraction transferred, 0..1; meaningful only while `isUploadingGpx`. */
      gpxProgress: 0,
      wasCancelledDuringUpload: false,
      /** Live only while a GPX upload is in flight, so the tile's Cancel can abort it. */
      gpxAbort: null as AbortController | null,
      proposedRemovals: new Set<string>(),
      /** The goal's place, apart from the tour's name (which may be typed). */
      goalPlace: '',
      // Way up, way down (activity-legs D3): a tapped line is the user's, the rest follow the default.
      legChoices: (types.length > 1
        ? Object.fromEntries(types.map((type) => [type, directionOf(init?.legs ?? null, type)]))
        : {}) as Partial<Record<TourType, LegDirection>>,
      flownUp: init?.tourTypes?.length === 1 && !!init.legs?.ascent.includes('paragliding'),
      /** Seasons follow the dates while the chips hold nothing or exactly what the dates say (D6). */
      autoSeasons:
        seasons.size === 0 || (dated.length === seasons.size && dated.every((x) => seasons.has(x))),
    };
  });
  /** The start / end a track set (design D9): a new track moves them; one set by hand stays. */
  const fromTrack = useReactive(() => ({ start: false, end: false }));
  /** Each picked or drawn file's line, drawing and numbers: the map and a redraw read the file. */
  const files = useRef({
    lines: new WeakMap<File, LngLat[]>(),
    drawings: new WeakMap<File, DrawnTrack>(),
    metrics: new WeakMap<File, RouteMetrics>(),
    /** The drawing on its way to a file, for the route step to go on from meanwhile. */
    pendingDrawing: null as DrawnTrack | null,
  }).current;

  /** More than one day: the moment to say what a stage is (design D8). */
  const spansDays = !!s.plannedDate && !!s.endDate && s.endDate > s.plannedDate;
  const pointsOpen = s.pointsByHand || !!s.startPoint || !!s.endPoint;
  const fileNumbers = (s.gpxFile && files.metrics.get(s.gpxFile)) ?? null;
  /** A drawn route is the track (D9): its points move through the route step. */
  const drawingOfFile = !s.gpxRemoved && s.gpxFile ? files.drawings.get(s.gpxFile) : undefined;
  const drawn = drawingOfFile ? { fromGoal: drawingOfFile.goal === 0 } : null;

  /** An example per selected scale; climbing alone names its two scales. */
  function gradePlaceholder() {
    const examples = gradeScales(s.selectedTourTypes).map(({ grades }) =>
      grades[0] === 'L' ? `${grades[1]}+` : grades[2]!,
    );
    if (s.selectedTourTypes.includes('climbing')) {
      if (!examples.length) return t('tours.form.gradePlaceholderClimbing');
      examples.push('5c');
    }
    return examples.length
      ? t('tours.form.gradePlaceholder', { example: examples.join(', ') })
      : t('tours.form.gradeOptional');
  }

  // ── Setters carrying the PWA's watchers ────────────────────────────────────
  function datedSeasons() {
    return seasonsForDates(
      s.plannedDate ? new Date(s.plannedDate) : null,
      s.plannedDate && s.endDate ? new Date(s.endDate) : null,
    );
  }
  /** A cleared date leaves the seasons as they are: an undated tour still has a season. */
  function followSeasons() {
    if (s.autoSeasons && s.plannedDate) s.selectedSeasons = new Set(datedSeasons());
  }
  /** An end date or a time without a start day has nothing to hang on: clearing the day clears both. */
  function setPlannedDate(value: string) {
    s.plannedDate = value;
    if (!value) {
      s.endDate = '';
      s.endDateError = false;
      s.startTime = '';
    }
    followSeasons();
  }
  function setEndDate(value: string) {
    s.endDate = value;
    followSeasons();
  }
  /** A dropped activity takes its scale's grade along; a hand-typed one stays. */
  function setTourTypes(types: TourType[]) {
    const before = s.selectedTourTypes;
    s.selectedTourTypes = types;
    const kept = new Set(gradeScales(types).map((sc) => sc.grades));
    const gone = gradeScales(before).filter((sc) => !kept.has(sc.grades));
    if (gone.length) s.grade = dropScales(s.grade, gone);
  }

  // ── GPX upload ─────────────────────────────────────────────────────────────
  /** Shared by both upload paths so the reset, the signal and the callback never drift apart. */
  function startGpxUpload() {
    s.gpxProgress = 0;
    s.isUploadingGpx = true;
    const abort = new AbortController();
    s.gpxAbort = abort;
    return { signal: abort.signal, onProgress: (fraction: number) => (s.gpxProgress = fraction) };
  }
  function endGpxUpload() {
    s.isUploadingGpx = false;
    s.gpxAbort = null;
  }
  /** Abort an in-flight GPX upload; a no-op once it has settled. */
  const cancelGpxUpload = () => s.gpxAbort?.abort();

  /**
   * Both upload paths funnel failures here so a cancel and a genuine failure are never handled
   * two ways. `key` is the object the attempt was writing to: an aborted PUT can leave bytes.
   */
  function onGpxUploadFailed(err: unknown, key: string) {
    const cancelled =
      (err instanceof DOMException && err.name === 'AbortError') || s.wasCancelledDuringUpload;
    removeGpx(key).catch(() => {});
    s.gpxFile = null;
    s.pendingTourId = null;
    // `gpxFilepath` stays: cancelling a REPLACEMENT leaves the tour's existing track on screen.
    if (!cancelled) s.gpxError = t('tours.form.gpxUploadFailed');
  }

  /** Drop the GPX this draft uploaded or staged: the object, its cached bytes, its replay marker. */
  function dropPendingGpx() {
    const key = s.pendingGpxKey;
    if (!key) return;
    removeGpx(key).catch(() => {});
    evictCachedFile(key);
    discardStaged(key).catch(() => {});
    s.pendingGpxKey = null;
  }

  // ── Attachments (create-flow pre-upload / suggest staging / edit direct) ───
  /**
   * Stable draft id: create-flow pre-uploads and suggest-mode staging live under it. Keyed on the
   * tour id, not on `initialDraft`: a new outing segment's form is seeded yet still creates.
   */
  const ids = useRef<{ draftId: string | null; attachmentTourId: string | null } | null>(null);
  ids.current ??= (() => {
    const draftId = tourId && !isSuggest ? null : newId();
    return { draftId, attachmentTourId: draftId && !isSuggest ? newId() : null };
  })();
  const { draftId, attachmentTourId } = ids.current;
  /** Create mode = staging a brand-new tour (suggest mode also has a draftId but no tour of its own). */
  const isCreate = draftId !== null && !isSuggest;

  /** Staged/pre-uploaded files (create + suggest) or persisted attachments (edit). */
  const attachments: TourAttachment[] = isCreate
    ? (preUploadedByDraft[draftId] ?? []).map((f, i) => ({
        id: f.id,
        tourId: attachmentTourId ?? '',
        userId: '',
        storagePath: f.storagePath,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        originalFilename: f.originalFilename,
        sortOrder: i,
        createdAt: new Date(),
      }))
    : draftId
      ? (stagedByDraft[draftId] ?? []).map((f, i) => ({
          id: `staged-${i}`,
          tourId: '',
          userId: '',
          storagePath: '',
          mimeType: f.type as TourAttachment['mimeType'],
          sizeBytes: f.size,
          originalFilename: f.name,
          sortOrder: i,
          createdAt: new Date(),
        }))
      : tourId
        ? (attachmentsByTour[tourId] ?? [])
        : [];

  /** Suggest mode: the owner's existing attachments, offered for proposed removal (D3). */
  const existingAttachments = tourId ? (attachmentsByTour[tourId] ?? []) : [];
  /** What the tour would still hold if this batch were accepted whole, excluding staged adds (D10). */
  const keptAttachmentCount = isSuggest
    ? existingAttachments.filter((a) => !s.proposedRemovals.has(a.id)).length
    : 0;
  /** Un-marking a removal after staging can overshoot: submit is gated on it. */
  const attachmentOverflow = keptAttachmentCount + attachments.length - MAX_ATTACHMENTS_PER_TOUR;

  function toggleProposedRemoval(id: string) {
    const next = new Set(s.proposedRemovals);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    s.proposedRemovals = next;
  }

  useEffect(() => {
    if (tourId && !useTourAttachmentsStore.getState().attachmentsByTour[tourId])
      void useTourAttachmentsStore.getState().load(tourId);
  }, [tourId]);

  // ── Swisstopo lookups ──────────────────────────────────────────────────────
  // Name and elevation fill in independently as each answer lands: the form never waits.
  const field = (
    key: 'tourName' | 'elevation' | `${'start' | 'end'}Point${'Name' | 'Elevation'}`,
  ) => ({
    get: () => s[key],
    set: (value: string) => (s[key] = value),
  });
  const goalName = useSwisstopoFill(field('tourName'));
  const goalElevation = useSwisstopoFill(field('elevation'));
  const startName = useSwisstopoFill(field('startPointName'));
  const startElevation = useSwisstopoFill(field('startPointElevation'));
  const endName = useSwisstopoFill(field('endPointName'));
  const endElevation = useSwisstopoFill(field('endPointElevation'));
  const fills = {
    goal: [goalName, goalElevation],
    start: [startName, startElevation],
    end: [endName, endElevation],
  } as const;
  /** A point's name and height show together, once both lookups have answered or failed. */
  const settling = (point: keyof typeof fills) =>
    fills[point].some((fill) => fill.status === 'loading');

  /** A map pick, a suggestion chip or a GPX end: set the point, then name it and look up its height. */
  function applyPick(p: PointPick) {
    if (p.type === 'start') s.startPoint = p.location;
    else if (p.type === 'end') s.endPoint = p.location;
    if (p.type !== 'goal') fromTrack[p.type] = false;
    else s.goalPlace = p.name ?? '';
    const [nameFill, elevationFill] = fills[p.type];
    // A place chosen in the picker's search names the point; otherwise look one up nearby.
    void nameFill.fill(
      (signal) =>
        p.name ??
        suggestTourName(p.location, signal).then((name) => {
          if (p.type === 'goal' && !signal.aborted) s.goalPlace = name ?? '';
          return name;
        }),
    );
    void elevationFill.fill((signal) =>
      p.elevation !== undefined ? p.elevation : getElevation(p.location, signal),
    );
  }

  function applyChange(change: PointChange) {
    if (change.location) applyPick(change);
    else if (change.type === 'start') handleRemoveStart();
    else handleRemoveEnd();
  }

  useEffect(() => {
    if (pick) [pick].flat().forEach(applyChange);
  }, [pick]);

  /**
   * A GPX names the empty ends (design D6): its first point, its last, or the start again for a
   * loop. A track end at the goal names nothing. Ends an earlier track set give way when this
   * track's lie elsewhere (design D9); where they stay, so do their names.
   */
  function fillPointsFromTrack(ends: { first: Point; last: Point } | null) {
    if (!ends) return;
    const goal = live.current.currentGoal;
    const loop = isSameGoal(ends.first, ends.last, NEAR_M);
    if (fromTrack.start && !isSameGoal(s.startPoint!, ends.first)) handleRemoveStart();
    if (fromTrack.end && !isSameGoal(s.endPoint!, loop && s.startPoint ? s.startPoint : ends.last))
      handleRemoveEnd();
    const atGoal = (p: Point) => !!goal && isSameGoal(p, goal, NEAR_M);
    if (!s.startPoint && !atGoal(ends.first)) {
      applyPick({ type: 'start', location: ends.first });
      fromTrack.start = true;
    }
    if (!s.endPoint && !atGoal(ends.last)) {
      const round = loop && !!s.startPoint;
      const at = round ? s.startPoint! : ends.last;
      applyPick({
        type: 'end',
        location: { ...at },
        name: round ? s.startPointName.trim() || undefined : undefined,
      });
      fromTrack.end = true;
    }
  }

  /**
   * A route's track (a drawing with its goal marked, D9) carries the start and end themselves: they
   * follow it. A stop moved a little keeps its name; farther, it is named anew.
   */
  function followStops(track: DrawnTrack & { goal: number }) {
    const stops = routeStops(track);
    for (const type of ['start', 'end'] as const) {
      const stop = stops[type];
      if (!stop) continue;
      const at = { lng: stop[0], lat: stop[1] };
      const key = type === 'start' ? 'startPoint' : 'endPoint';
      const point = s[key];
      if (point && isSameGoal(point, at, NEAR_M)) {
        s[key] = at;
        continue;
      }
      // Back at the start: a round trip, its end named as its start.
      const round = type === 'end' && !!s.startPoint && isSameGoal(s.startPoint, at, 1);
      applyPick(
        round
          ? {
              type,
              location: at,
              name: s.startPointName.trim() || undefined,
              elevation: s.startPointElevation ? Number(s.startPointElevation) : undefined,
            }
          : { type, location: at },
      );
    }
  }

  function lookupPlaceholder(fill: SwisstopoFill, placeholder: string) {
    if (fill.status === 'loading') return t('tours.form.swisstopo.loading');
    return fill.status === 'failed' ? t('tours.form.swisstopo.failed') : placeholder;
  }

  // Surface the live activity types and points so the map can draft-preview them.
  useEffect(() => void onTourTypesChange?.(s.selectedTourTypes), [s.selectedTourTypes]);
  useEffect(() => void onStartPointChange?.(s.startPoint), [s.startPoint]);
  useEffect(() => void onEndPointChange?.(s.endPoint), [s.endPoint]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function togglePartner(contactId: string) {
    const next = new Set(s.selectedPartnerIds);
    if (next.has(contactId)) next.delete(contactId);
    else next.add(contactId);
    s.selectedPartnerIds = next;
  }

  /** Multi-select; the list always follows the chip (= `TOUR_TYPE_VALUES`) order, not tap order. */
  function toggleTourType(type: TourType) {
    const on = !s.selectedTourTypes.includes(type);
    setTourTypes(
      TOUR_TYPE_VALUES.filter((v) => (v === type ? on : s.selectedTourTypes.includes(v))),
    );
  }

  // ── Way up, way down (activity-legs D3) ────────────────────────────────────
  // A lone glider climbs to the launch ("down"), or flies from the start in thermals ("both").
  const soloFlight = s.selectedTourTypes.length === 1 && s.selectedTourTypes[0] === 'paragliding';
  // Choices outlive their activity; should a removal leave a way without activity, the defaults show.
  function legDirection(type: TourType): LegDirection {
    if (soloFlight) return s.flownUp ? 'both' : 'down';
    const types = s.selectedTourTypes;
    const chosen = (x: TourType) => s.legChoices[x] ?? defaultDirection(x, types);
    return waysCovered(types, chosen) ? chosen(type) : defaultDirection(type, types);
  }
  const legAllowed = (type: TourType, way: LegDirection) =>
    soloFlight || waysCovered(s.selectedTourTypes, (x) => (x === type ? way : legDirection(x)));
  const legs: TourLegs | null = soloFlight
    ? s.flownUp
      ? { ascent: ['paragliding'], descent: ['paragliding'] }
      : null
    : s.selectedTourTypes.length > 1
      ? legsFrom(s.selectedTourTypes, legDirection)
      : null;
  function setLegDirection(type: TourType, direction: LegDirection) {
    if (soloFlight) {
      s.flownUp = direction === 'both';
      return;
    }
    const shown = Object.fromEntries(s.selectedTourTypes.map((x) => [x, legDirection(x)]));
    s.legChoices = { ...s.legChoices, ...shown, [type]: direction };
  }
  /** Flying comes last: it's how the day ends. */
  const legRows = [...s.selectedTourTypes].sort(
    (a, b) => Number(a === 'paragliding') - Number(b === 'paragliding'),
  );
  /** A flown way down ends where the glider lands. */
  const endIsLanding = landsByAir({ tourTypes: s.selectedTourTypes, legs });
  /** The track's time, as the drawing showed it: its activities at the user's pace. */
  const fileMinutes =
    fileNumbers && tourMinutes(fileNumbers, { tourTypes: s.selectedTourTypes, legs }, pace);

  function toggleSeason(season: Season) {
    s.autoSeasons = false;
    const next = new Set(s.selectedSeasons);
    if (next.has(season)) next.delete(season);
    else next.add(season);
    s.selectedSeasons = next;
  }

  async function handleGpxUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    await acceptGpxFile(file);
  }

  /** A picked or drawn GPX file: it names the empty ends, then uploads (or stages offline) at once. */
  async function acceptGpxFile(file: File) {
    s.gpxError = null;
    try {
      const track = await parseGpxFile(file);
      files.lines.set(
        file,
        trackLines(track)
          .flat()
          .map(([lng, lat]) => [lng!, lat!] as LngLat),
      );
      files.metrics.set(file, trackMetrics(track));
      fillPointsFromTrack(trackEnds(track));
    } catch (err) {
      s.gpxError =
        err instanceof GpxFileTooLargeError
          ? t('tours.form.gpxTooLarge')
          : err instanceof GpxParseError
            ? t('tours.form.gpxInvalid')
            : t('tours.form.gpxReadError');
      s.gpxFile = null;
      return;
    }

    if (s.pendingGpxKey) {
      dropPendingGpx();
      s.pendingTourId = null;
    }
    s.gpxFile = file;
    s.gpxRemoved = false;

    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      s.gpxError = t('tours.form.gpxUploadFailed');
      s.gpxFile = null;
      return;
    }
    const newTourId = newId();
    s.pendingTourId = newTourId;

    // Suggest mode is online-only (D6) and writes to the suggester's own staging prefix (D9).
    if (isSuggest) {
      if (!isOnline()) {
        s.gpxError = t('tours.suggestions.offline');
        s.gpxFile = null;
        s.pendingTourId = null;
        return;
      }
      const key = `${userId}/suggestions/${live.current.tourId}/${newId()}.gpx`;
      try {
        await uploadGpxToKey(key, file, startGpxUpload());
        s.pendingGpxKey = key;
      } catch (err) {
        onGpxUploadFailed(err, key);
      } finally {
        endGpxUpload();
      }
      return;
    }

    // Offline: stage the track under its client-minted storage key. It renders now from the same
    // cache the display path reads, and the tour write queues with it, uploading on replay.
    if (!isOnline()) {
      const key = gpxStorageKey(userId, newTourId);
      try {
        await stageText(key, await file.text());
      } catch {
        discardStaged(key).catch(() => {});
        s.gpxError = t('tours.form.gpxUploadFailed');
        s.gpxFile = null;
        s.pendingTourId = null;
        return;
      }
      s.pendingGpxKey = key;
      return;
    }

    s.wasCancelledDuringUpload = false;
    try {
      const key = await uploadGpx(userId, newTourId, file, startGpxUpload());
      if (s.wasCancelledDuringUpload) removeGpx(key).catch(() => {});
      else s.pendingGpxKey = key;
    } catch (err) {
      // The key `uploadGpx` would have returned: the throw ate its return.
      onGpxUploadFailed(err, gpxStorageKey(userId, newTourId));
    } finally {
      endGpxUpload();
    }
  }

  /** Abandon the draft: abort and delete what it uploaded (also a removed day's stage, D4). */
  function discard() {
    if (s.isUploadingGpx) {
      // The flag covers the race where the upload resolved a tick before this ran.
      s.wasCancelledDuringUpload = true;
      cancelGpxUpload();
    } else dropPendingGpx();
    // Create mode pre-uploads its attachments (D5): abandoning the draft deletes them. EDIT mode
    // does NOT cancel uploads: an attachment row is independent of the tour save.
    if (draftId && !isSuggest)
      void useTourAttachmentsStore.getState().discardDraft(draftId, attachmentTourId);
    else if (draftId) useTourAttachmentsStore.getState().clearStaged(draftId);
  }

  function handleCancel() {
    discard();
    onCancel?.();
  }

  function handleRemoveGpx() {
    // A track whose upload is still running would orphan the object: abort it first.
    cancelGpxUpload();
    if (s.pendingGpxKey) {
      dropPendingGpx();
      s.pendingTourId = null;
    }
    s.gpxFile = null;
    s.gpxFilepath = null;
    s.gpxRemoved = true;
    s.gpxError = null;
  }

  /**
   * Draw the track on the map, going on from the current one: a drawing exactly as drawn, any
   * other track (picked, or saved: loaded first) with its turning points to drag.
   */
  async function startDrawing() {
    const file = s.gpxFile;
    let seed = file ? (files.drawings.get(file) ?? null) : null;
    const line = file && files.lines.get(file);
    if (!seed && line) seed = trackFromLine(line);
    if (!file && !s.gpxRemoved && s.gpxFilepath && tourId) {
      s.loadingSeed = true;
      const saved = await loadGpxTrack({ id: tourId, gpxFilepath: s.gpxFilepath });
      s.loadingSeed = false;
      seed =
        saved &&
        trackFromLine(
          trackLines(saved)
            .flat()
            .map(([lng, lat]) => [lng!, lat!] as LngLat),
        );
    }
    onDrawTrack?.(seed ?? routeSeed());
  }

  /** No track yet: the drawing starts as the route's start, goal and end, joined along the ways (D9). */
  function routeSeed(): DrawnTrack | null {
    const goal = live.current.currentGoal;
    if (!goal) return null;
    const ll = (p: Point): LngLat => [p.lng, p.lat];
    const points = [s.startPoint, goal, s.endPoint].filter((p) => p !== null).map(ll);
    return { points, legs: [], goal: s.startPoint ? 1 : 0 };
  }

  /**
   * A finished drawing becomes the tour's GPX file, with the terrain's heights when online. Its
   * points are the same either way, so a route planned twice is one track (`dropIfDuplicate`).
   */
  async function acceptDrawnTrack(track: DrawnTrack) {
    s.preparingTrack = true;
    files.pendingDrawing = track;
    try {
      const line = trackLine(track);
      // Its ends are known now: name them while the heights load, not after.
      const [first, last] = [line[0], line.at(-1)];
      if (track.goal != null) followStops({ ...track, goal: track.goal });
      else if (first && last)
        fillPointsFromTrack({
          first: { lng: first[0], lat: first[1] },
          last: { lng: last[0], lat: last[1] },
        });
      const profiled = isOnline() ? await getTrackProfile(line) : null;
      const gpx = gpxFromLine(
        profiled?.line ?? densify(line),
        profiled?.heights ?? null,
        s.tourName.trim() || t('tours.form.gpxDrawn'),
      );
      const file = new File(
        [gpx],
        t('tours.form.gpxDrawnFile', { distance: formatDistance(lineLength(line)) }),
        { type: 'application/gpx+xml' },
      );
      files.drawings.set(file, track);
      await acceptGpxFile(file);
    } finally {
      if (files.pendingDrawing === track) {
        s.preparingTrack = false;
        files.pendingDrawing = null;
      }
    }
  }
  // A drawing of no points (a route gone straight) takes the drawn track away; an upload stays.
  useEffect(() => {
    if (drawnTrack && drawnTrack.points.length > 1) void acceptDrawnTrack(drawnTrack);
    else if (drawnTrack && s.gpxFile && files.drawings.has(s.gpxFile)) handleRemoveGpx();
  }, [drawnTrack]);

  const trackShown = useRef(false);
  useEffect(() => {
    if (!trackShown.current) {
      trackShown.current = true;
      return;
    }
    onTrackChange?.(s.gpxRemoved ? [] : s.gpxFile ? (files.lines.get(s.gpxFile) ?? null) : null);
  }, [s.gpxRemoved, s.gpxFile]);

  // A <button> can't open a file dialog the way a <label> does: one hidden input serves both.
  const gpxInput = useRef<HTMLInputElement>(null);
  const openGpxPicker = () => gpxInput.current?.click();

  /** The end stays: it stands on its own (a connected stage ends where the next one starts). */
  function handleRemoveStart() {
    startName.cancel();
    startElevation.cancel();
    s.startPoint = null;
    s.startPointName = '';
    s.startPointElevation = '';
    fromTrack.start = false;
    s.pointsByHand &&= !!s.endPoint;
  }

  function handleRemoveEnd() {
    endName.cancel();
    endElevation.cancel();
    s.endPoint = null;
    s.endPointName = '';
    s.endPointElevation = '';
    fromTrack.end = false;
    s.pointsByHand &&= !!s.startPoint;
  }

  /** Back to the start: a drawn route that ends at its goal goes back the way it came. */
  function handleRoundTrip() {
    if (!s.startPoint) return;
    const drawing = !s.gpxRemoved && s.gpxFile ? files.drawings.get(s.gpxFile) : undefined;
    if (drawing?.goal && drawing.goal === drawing.points.length - 1) {
      void acceptDrawnTrack(withWayBack(drawing));
      return;
    }
    fromTrack.end = false;
    s.endPoint = { lng: s.startPoint.lng, lat: s.startPoint.lat };
    s.endPointName = s.startPointName;
    s.endPointElevation = s.startPointElevation;
  }

  // One source of truth for "saving is not permitted right now": the in-form button, the top-bar
  // Save buttons and `handleSubmit` all read it. A FAILED attachment upload does not count (D6).
  const submitBlocked =
    s.isUploadingGpx || s.preparingTrack || attachmentsUploading || attachmentOverflow > 0;

  /** The form as a draft, unchecked: what the next day's stage is seeded from. */
  function snapshot(): TourDraft {
    const effectiveGpxFilepath = s.gpxRemoved ? null : (s.pendingGpxKey ?? s.gpxFilepath);
    return {
      name: s.tourName.trim(),
      plannedDate: s.plannedDate ? new Date(s.plannedDate) : null,
      endDate: s.plannedDate && s.endDate ? new Date(s.endDate) : null,
      partnerIds: Array.from(s.selectedPartnerIds),
      visibility: s.visibility,
      tourTypes: s.selectedTourTypes,
      elevation: s.elevation ? Number(s.elevation) : null,
      gpxFilepath: effectiveGpxFilepath,
      description: s.description.trim() || null,
      seasons: s.selectedSeasons.size > 0 ? Array.from(s.selectedSeasons) : null,
      startPoint: s.startPoint,
      endPoint: s.endPoint,
      startPointName: s.startPointName.trim() || null,
      startPointElevation: s.startPointElevation ? Number(s.startPointElevation) : null,
      endPointName: s.endPointName.trim() || null,
      endPointElevation: s.endPointElevation ? Number(s.endPointElevation) : null,
      equipment: s.equipment.trim() || null,
      notes: s.notes.trim() || null,
      grade: normalizeGrade(s.grade) || null,
      legs,
      startTime: s.plannedDate && s.startTime ? s.startTime : null,
    };
  }

  /** What saving would send, or null after showing what stops it (`focus`: move there). */
  function collect(focus = true): TourFormOutput | null {
    if (!s.tourName.trim()) {
      s.nameError = true;
      if (focus) document.getElementById(`${idPrefix}-tourName`)?.focus();
      return null;
    }
    // `min` on the input is bypassable by typing; the DB CHECK is the backstop.
    if (s.plannedDate && s.endDate && s.endDate < s.plannedDate) {
      s.endDateError = true;
      if (focus) document.getElementById(`${idPrefix}-endDate`)?.focus();
      return null;
    }
    // Pre-uploaded attachments want the created tour to carry their id; GPX wins when both minted one.
    const hasPreUploadedAttachments =
      !!draftId &&
      (useTourAttachmentsStore.getState().preUploadedByDraft[draftId]?.length ?? 0) > 0;
    return {
      draft: snapshot(),
      gpxRemoved: s.gpxRemoved,
      preUploadedTourId: s.pendingTourId ?? (hasPreUploadedAttachments ? attachmentTourId : null),
      draftId: draftId ?? '',
      proposedRemovals: Array.from(s.proposedRemovals),
    };
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // An external (top-bar) Save bypasses the `disabled` attribute: guard here too.
    if (disabled || submitBlocked) return;
    const out = collect();
    if (out) onSubmit?.(out);
  }

  /** The stage's points as the form holds them, for the route planner (D3). */
  function route(): StageRoute {
    const file = s.gpxRemoved ? null : s.gpxFile;
    const drawing = files.pendingDrawing ?? (file && files.drawings.get(file)) ?? null;
    return {
      goal: {
        name: s.goalPlace || s.tourName.trim(),
        place: s.goalPlace || null,
        elevation: height(s.elevation),
      },
      start: s.startPoint && {
        location: s.startPoint,
        name: s.startPointName.trim(),
        elevation: height(s.startPointElevation),
      },
      end: s.endPoint && {
        location: s.endPoint,
        name: s.endPointName.trim(),
        elevation: height(s.endPointElevation),
      },
      drawing,
      fixedLine: !drawing && file ? (files.lines.get(file) ?? null) : null,
    };
  }

  const handover: TourFormPublic['handover'] = s.endPoint
    ? {
        location: s.endPoint,
        name: s.endPointName.trim(),
        elevation: height(s.endPointElevation),
      }
    : currentGoal
      ? {
          location: currentGoal,
          name: s.goalPlace || s.tourName.trim(),
          elevation: height(s.elevation),
        }
      : null;

  const shared: TourFormShared = {
    tourTypes: s.selectedTourTypes,
    partnerIds: [...s.selectedPartnerIds].sort(),
    visibility: s.visibility,
  };
  function adopt(values: Partial<TourFormShared & { plannedDate: string }>) {
    if (values.tourTypes) setTourTypes(values.tourTypes);
    if (values.partnerIds) s.selectedPartnerIds = new Set(values.partnerIds);
    if (values.visibility) s.visibility = values.visibility;
    if (values.plannedDate !== undefined) setPlannedDate(values.plannedDate);
  }

  /** "Split into daily stages" (D5): this form keeps the first day, the next day's stage follows. */
  const spanDayCount = spansDays
    ? Math.round((Date.parse(s.endDate) - Date.parse(s.plannedDate)) / 86_400_000) + 1
    : 0;
  function splitDays() {
    const days = spanDayCount;
    setEndDate('');
    onNextDay?.(days);
  }

  // The host reads this state as it changes (Vue read the exposed refs).
  const publicState: TourFormPublic = {
    tourName: s.tourName,
    plannedDate: s.plannedDate,
    shared,
    handover,
    submitBlocked,
  };
  const publicKey = JSON.stringify(publicState);
  useEffect(() => void onPublic?.(publicState), [publicKey]);

  useImperativeHandle(ref, () => ({
    cancel: handleCancel,
    discard,
    collect,
    snapshot,
    route,
    adopt,
  }));

  // ── Template ───────────────────────────────────────────────────────────────
  const id = (name: string) => `${idPrefix}-${name}`;
  const lookupInput = (
    name: string,
    key: 'tourName' | 'elevation' | `${'start' | 'end'}Point${'Name' | 'Elevation'}`,
    point: keyof typeof fills,
    fill: SwisstopoFill,
    opts: { number?: boolean; compact?: boolean; error?: boolean; required?: boolean },
    onInput: () => void,
  ) => (
    <div className={c('lookup')}>
      <input
        id={id(name)}
        value={s[key]}
        className={c('input', { 'input--error': !!opts.error, 'input--compact': !!opts.compact })}
        {...(opts.number
          ? { type: 'number', min: 0, max: 9000 }
          : { type: 'text', maxLength: 100 })}
        placeholder={lookupPlaceholder(
          fill,
          opts.number ? t('tours.form.elevationPlaceholder') : t('tours.form.namePlaceholder'),
        )}
        aria-required={opts.required || undefined}
        aria-invalid={opts.required ? !!opts.error : undefined}
        aria-busy={settling(point)}
        onChange={(e) => {
          s[key] = e.target.value;
          onInput();
        }}
      />
      {settling(point) && <span className={c('lookup-skeleton')} aria-hidden="true" />}
    </div>
  );
  const pointFields = (type: 'start' | 'end') => {
    const [nameFill, elevationFill] = fills[type];
    const touched = () => {
      fromTrack[type] = false;
    };
    return (
      <>
        <div className={c('field')}>
          <label className={c('label')} htmlFor={id(`${type}-name`)}>
            {t('tours.form.pointNameLabel')}
          </label>
          {lookupInput(`${type}-name`, `${type}PointName`, type, nameFill, {}, () => {
            nameFill.input();
            touched();
          })}
        </div>
        <div className={c('field')}>
          <label className={c('label')} htmlFor={id(`${type}-elevation`)}>
            {t('tours.form.elevationLabel')}
          </label>
          {lookupInput(
            `${type}-elevation`,
            `${type}PointElevation`,
            type,
            elevationFill,
            { number: true },
            () => {
              elevationFill.input();
              touched();
            },
          )}
        </div>
      </>
    );
  };
  const gpxShown = !!s.gpxFile || !!s.gpxFilepath;

  return (
    <form
      id={formId}
      className={c('form')}
      style={hidden ? { display: 'none' } : undefined}
      onSubmit={handleSubmit}
    >
      <fieldset className={c('form-fieldset')} disabled={disabled}>
        <div className={c('scroll-body')}>
          {/* Location details: the dialog's title heads it (the route fits a phone's first screen, D9). */}
          <div className={c('section')}>
            <div className={c('field')}>
              <label className={c('label')} htmlFor={id('tourName')}>
                {t('tours.form.nameLabel')} <span className={c('required-mark')}>*</span>
              </label>
              {lookupInput(
                'tourName',
                'tourName',
                'goal',
                goalName,
                { error: s.nameError, required: true },
                () => {
                  s.nameError = false;
                  goalName.input();
                },
              )}
              {s.nameError && <p className={c('field-error')}>{t('tours.form.nameRequired')}</p>}
            </div>

            {/* Goal: title, coordinates and change on one line, its height beside its label. */}
            {currentGoal && (
              <div className={c('point-section point-section--goal')}>
                <div className={c('goal-head')}>
                  <BaseIcon name="flag" className={c('point-section-icon')} />
                  <span className={c('goal-text')}>
                    <span className={c('point-section-title')}>{t('tours.form.goalLabel')}</span>
                    <span className={c('point-coords')}>{formatPoint(currentGoal)}</span>
                  </span>
                  {allowGoalEdit && (
                    <BaseButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onPickPoint?.('goal')}
                    >
                      <BaseIcon name="my_location" />
                      {t('tours.form.changeGoalBtn')}
                    </BaseButton>
                  )}
                </div>
                <div className={c('field field--inline')}>
                  <label className={c('label')} htmlFor={id('elevation')}>
                    {t('tours.form.elevationLabel')}
                  </label>
                  {lookupInput(
                    'elevation',
                    'elevation',
                    'goal',
                    goalElevation,
                    { number: true, compact: true },
                    () => goalElevation.input(),
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tour type */}
          <div className={c('section')}>
            <p className={c('section-label')}>{t('tours.form.activityLabel')}</p>
            <div className={c('type-chips')}>
              {TOUR_TYPE_VALUES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={c('type-chip', { selected: s.selectedTourTypes.includes(type) })}
                  data-type={type}
                  style={{ '--chip-type': TOUR_TYPE_COLORS[type] } as CSSProperties}
                  onClick={() => toggleTourType(type)}
                >
                  <BaseIcon name={TOUR_TYPE_ICONS[type]} className={c('type-icon')} />
                  <span className={c('type-label')}>
                    {tk(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}`)}
                  </span>
                </button>
              ))}
            </div>
            {(s.selectedTourTypes.length > 1 || soloFlight) && (
              <ActivityLegs
                types={legRows}
                direction={legDirection}
                allowed={legAllowed}
                solo={soloFlight}
                onSet={setLegDirection}
              />
            )}
          </div>

          {/* Route: the track first, start and end after it, then its grade (design D9) */}
          <div className={c('section')}>
            <p className={c('section-label')}>{t('tours.form.routeSectionLabel')}</p>
            <input
              ref={gpxInput}
              type="file"
              accept=".gpx,application/gpx+xml,application/xml,text/xml,application/octet-stream"
              className={c('hidden-input')}
              tabIndex={-1}
              aria-label={t('tours.form.gpxLabel')}
              onChange={(e) => void handleGpxUpload(e)}
            />
            {/* Staging offline transfers nothing, so no bar appears. */}
            {s.preparingTrack ? (
              <UploadTile
                className={c('gpx-filled-row')}
                icon="route"
                filename={t('tours.form.gpxPreparing')}
              />
            ) : gpxShown ? (
              <UploadTile
                className={c('gpx-filled-row')}
                icon={s.isUploadingGpx ? 'upload_file' : 'route'}
                filename={
                  s.gpxFile
                    ? files.drawings.has(s.gpxFile)
                      ? t('tours.form.gpxDrawn')
                      : s.gpxFile.name
                    : t('tours.form.gpxExistingTrack')
                }
                progress={s.isUploadingGpx ? s.gpxProgress : null}
                progressLabel={t('tours.form.gpxUploading')}
                status={
                  fileNumbers && !s.isUploadingGpx ? (
                    <RouteNumbers
                      metrics={fileNumbers}
                      minutes={fileMinutes}
                      className={c('gpx-numbers')}
                      data-testid="gpx-numbers"
                    />
                  ) : undefined
                }
              >
                {/* Cancel for the duration of an upload, as the attachment rows have. */}
                {s.isUploadingGpx && (
                  <BaseTooltip text={t('tours.attachments.cancelUpload')}>
                    <BaseIconButton
                      name="close"
                      label={t('tours.attachments.cancelUpload')}
                      shape="square"
                      size="sm"
                      data-testid="gpx-cancel-btn"
                      onClick={cancelGpxUpload}
                    />
                  </BaseTooltip>
                )}
                <BaseTooltip text={t('tours.form.gpxRemoveTooltip')}>
                  <BaseIconButton
                    name="delete"
                    label={t('tours.form.gpxRemoveTooltip')}
                    shape="square"
                    size="sm"
                    tone="danger"
                    data-testid="gpx-remove-btn"
                    onClick={handleRemoveGpx}
                  />
                </BaseTooltip>
              </UploadTile>
            ) : (
              <div className={c('gpx-empty-row')}>
                <BaseButton
                  type="button"
                  variant="primary"
                  size="sm"
                  data-testid="gpx-draw-btn"
                  onClick={() => void startDrawing()}
                >
                  <BaseIcon name="draw" />
                  {t('tours.form.gpxDrawBtn')}
                </BaseButton>
                <BaseButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="gpx-upload-btn"
                  onClick={openGpxPicker}
                >
                  <BaseIcon name="upload_file" />
                  {t('tours.form.gpxUploadBtn')}
                </BaseButton>
              </div>
            )}
            {gpxShown && !s.preparingTrack && !s.isUploadingGpx && (
              <div className={c('gpx-empty-row')}>
                <BaseButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={s.loadingSeed}
                  data-testid="gpx-edit-btn"
                  onClick={() => void startDrawing()}
                >
                  <BaseIcon name="draw" />
                  {t('tours.form.gpxEditBtn')}
                </BaseButton>
                <BaseButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="gpx-replace-btn"
                  onClick={openGpxPicker}
                >
                  <BaseIcon name="upload_file" />
                  {t('tours.form.gpxReplaceTooltip')}
                </BaseButton>
              </div>
            )}
            {s.gpxError && <p className={c('gpx-error')}>{s.gpxError}</p>}

            {/* Start and end fold into one row while both are empty: a track sets them (D9). */}
            {!pointsOpen ? (
              <div className={c('points-fold')} data-testid="points-fold">
                <span className={c('points-fold-icons')} aria-hidden="true">
                  <BaseIcon name="trip_origin" size="sm" />
                  <BaseIcon name="sports_score" size="sm" />
                </span>
                <span className={c('points-fold-text')}>{t('tours.form.pointsFromTrack')}</span>
                <BaseButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="points-by-hand-btn"
                  onClick={() => (s.pointsByHand = true)}
                >
                  {t('tours.form.pointsByHandBtn')}
                </BaseButton>
              </div>
            ) : (
              <>
                {/* Start point */}
                <div className={c('point-section point-section--start')}>
                  <div className={c('point-section-header')}>
                    <BaseIcon name="trip_origin" className={c('point-section-icon')} />
                    <span className={c('point-section-title')}>
                      {t('tours.form.startPointLabel')}
                    </span>
                    {s.startPoint && fromTrack.start && (
                      <span className={c('point-source')} data-testid="start-from-track">
                        {t('tours.form.fromTrack')}
                      </span>
                    )}
                  </div>
                  <div className={c('point-row')}>
                    <span className={c('point-coords')}>
                      {s.startPoint
                        ? formatPoint(s.startPoint)
                        : drawn?.fromGoal
                          ? t('tours.form.trackFromGoal')
                          : t('tours.form.pointNotSet')}
                      {s.startPoint && currentGoal && (
                        <>
                          {' '}
                          <PointDistance goal={currentGoal} point={s.startPoint} />
                        </>
                      )}
                    </span>
                    <BaseButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onPickPoint?.('start')}
                    >
                      <BaseIcon name="my_location" />
                      {s.startPoint ? t('tours.form.changeGoalBtn') : t('tours.form.pickBtn')}
                    </BaseButton>
                    {s.startPoint && (
                      <BaseIconButton
                        name="delete"
                        label={t('tours.form.removeStartBtn')}
                        size="sm"
                        tone="danger"
                        data-testid="remove-start-btn"
                        onClick={handleRemoveStart}
                      />
                    )}
                  </div>
                  {!s.startPoint && currentGoal && !drawn && (
                    <PointSuggestions
                      role="start"
                      around={currentGoal}
                      tourId={tourId}
                      onPick={(p) => applyPick({ type: 'start', ...p })}
                    />
                  )}
                  {s.startPoint && pointFields('start')}
                </div>

                {/* End point: always offered, start or not (a flight from the goal needs only the landing). */}
                <div className={c('point-section point-section--end')}>
                  <div className={c('point-section-header')}>
                    <BaseIcon name="sports_score" className={c('point-section-icon')} />
                    <span className={c('point-section-title')}>
                      {endIsLanding ? t('tours.form.landingLabel') : t('tours.form.endPointLabel')}
                    </span>
                    {s.endPoint && fromTrack.end && (
                      <span className={c('point-source')} data-testid="end-from-track">
                        {t('tours.form.fromTrack')}
                      </span>
                    )}
                  </div>
                  {s.endPoint ? (
                    <>
                      <div className={c('point-row')}>
                        <span className={c('point-coords')}>
                          {formatPoint(s.endPoint)}
                          {currentGoal && (
                            <>
                              {' '}
                              <PointDistance goal={currentGoal} point={s.endPoint} />
                            </>
                          )}
                        </span>
                        <BaseButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onPickPoint?.('end')}
                        >
                          <BaseIcon name="my_location" />
                          {t('tours.form.changeGoalBtn')}
                        </BaseButton>
                        <BaseIconButton
                          name="delete"
                          label={t('tours.form.removeEndBtn')}
                          size="sm"
                          data-testid="remove-end-btn"
                          tone="danger"
                          onClick={handleRemoveEnd}
                        />
                      </div>
                      {pointFields('end')}
                    </>
                  ) : (
                    <>
                      <div className={c('point-row')}>
                        <BaseButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onPickPoint?.('end')}
                        >
                          <BaseIcon name="add" />
                          {endIsLanding
                            ? t('tours.form.addLandingBtn')
                            : t('tours.form.addEndPointBtn')}
                        </BaseButton>
                        {s.startPoint && !endIsLanding && (
                          <BaseButton
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={handleRoundTrip}
                          >
                            <BaseIcon name="u_turn_left" />
                            {t('tours.form.roundTripBtn')}
                          </BaseButton>
                        )}
                      </div>
                      {currentGoal && !drawn && (
                        <PointSuggestions
                          role="end"
                          around={currentGoal}
                          exclude={s.startPoint}
                          tourId={tourId}
                          landing={endIsLanding}
                          onPick={(p) => applyPick({ type: 'end', ...p })}
                        />
                      )}
                    </>
                  )}
                </div>
              </>
            )}
            {/* After the end: the next day's stage starts where this one finishes (D4). */}
            {stages && (
              <button
                type="button"
                className={c('next-day')}
                data-testid="next-day-btn"
                onClick={() => onNextDay?.()}
              >
                <BaseIcon name="add" className={c('next-day-icon')} />
                <span className={c('next-day-text')}>
                  <span className={c('next-day-title')}>{t('tours.form.nextDayBtn')}</span>
                  <span className={c('next-day-hint')}>{t('tours.form.nextDayHint')}</span>
                </span>
              </button>
            )}
            <div className={c('field')}>
              <label className={c('label')} htmlFor={id('grade')}>
                {t('tours.form.gradeLabel')}
              </label>
              <input
                id={id('grade')}
                value={s.grade}
                className={c('input')}
                type="text"
                maxLength={GRADE_MAX_LENGTH}
                placeholder={gradePlaceholder()}
                autoComplete="off"
                data-testid="grade-input"
                onChange={(e) => (s.grade = e.target.value)}
              />
              <GradeChips
                value={s.grade}
                tourTypes={s.selectedTourTypes}
                onChange={(value) => (s.grade = value)}
              />
            </div>
          </div>

          {/* When: the seasons follow the dates (design D6) */}
          <div className={c('section')}>
            <p className={c('section-label')}>{t('tours.form.whenSectionLabel')}</p>
            <div className={c('date-time')}>
              <div className={c('field')}>
                <label className={c('label')} htmlFor={id('plannedDate')}>
                  {t('tours.form.plannedDateLabel')}
                </label>
                <input
                  id={id('plannedDate')}
                  value={s.plannedDate}
                  className={c('input')}
                  type="date"
                  onChange={(e) => setPlannedDate(e.target.value)}
                />
              </div>
              <div className={c('field')}>
                <label className={c('label')} htmlFor={id('startTime')}>
                  {t('tours.form.startTimeLabel')}
                </label>
                <input
                  id={id('startTime')}
                  value={s.startTime}
                  className={c('input')}
                  type="time"
                  disabled={!s.plannedDate}
                  data-testid="start-time-input"
                  onChange={(e) => (s.startTime = e.target.value)}
                />
              </div>
            </div>

            {/* Always rendered, labelled optional: two date inputs read as a range. Empty = single day. */}
            <div className={c('field')}>
              <label className={c('label')} htmlFor={id('endDate')}>
                {t('tours.form.endDateLabel')}
              </label>
              <input
                id={id('endDate')}
                value={s.endDate}
                className={c('input', { 'input--error': s.endDateError })}
                type="date"
                min={s.plannedDate || undefined}
                disabled={!s.plannedDate}
                aria-invalid={s.endDateError}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  s.endDateError = false;
                }}
              />
              {s.endDateError ? (
                <p className={c('field-error')}>{t('tours.form.endDateBeforeStartError')}</p>
              ) : spansDays && stages ? (
                <div className={c('split-days')} data-testid="multi-day-hint">
                  <p className={c('field-hint')}>
                    {t('tours.form.splitDaysHint', { count: spanDayCount })}
                  </p>
                  <BaseButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-testid="split-days-btn"
                    onClick={splitDays}
                  >
                    <BaseIcon name="calendar_view_day" />
                    {t('tours.form.splitDaysBtn')}
                  </BaseButton>
                </div>
              ) : spansDays ? (
                <p className={c('field-hint')} data-testid="multi-day-hint">
                  {t('tours.form.multiDayHint')}
                </p>
              ) : null}
            </div>

            <div className={c('field')}>
              <p className={c('label')}>{t('tours.form.seasonLabel')}</p>
              <div className={c('season-chips')}>
                {SEASON_VALUES.map((season) => (
                  <button
                    key={season}
                    type="button"
                    className={c('season-chip', { selected: s.selectedSeasons.has(season) })}
                    onClick={() => toggleSeason(season)}
                  >
                    {tk(`tours.season.${season}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tour partners (not suggestable: the owner's contact namespace, D2) */}
          {!isSuggest && contacts.length > 0 && (
            <div className={c('section')}>
              <p className={c('section-label')}>{t('tours.form.partnersLabel')}</p>
              <div className={c('chips')}>
                {contacts.map((contact) => (
                  <ContactChip
                    key={contact.id}
                    contact={contact}
                    selected={s.selectedPartnerIds.has(contact.id)}
                    onToggle={togglePartner}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Visibility (not suggestable: it IS the privacy control, D2) */}
          {!isSuggest && (
            <div className={c('section')}>
              <p className={c('section-label')}>{t('tours.form.visibilityLabel')}</p>
              <div className={c('type-chips')}>
                <button
                  type="button"
                  className={c('type-chip', { selected: s.visibility === 'friends' })}
                  onClick={() => (s.visibility = 'friends')}
                >
                  <BaseIcon name="group" className={c('type-icon')} />
                  <span className={c('type-label')}>{t('tours.form.visibilityFriends')}</span>
                </button>
                <button
                  type="button"
                  className={c('type-chip', { selected: s.visibility === 'private' })}
                  onClick={() => (s.visibility = 'private')}
                >
                  <BaseIcon name="lock" className={c('type-icon')} />
                  <span className={c('type-label')}>{t('tours.form.visibilityPrivate')}</span>
                </button>
              </div>
              <p className={c('field-hint')}>
                {s.visibility === 'private'
                  ? t('tours.form.visibilityPrivateHint')
                  : t('tours.form.visibilityFriendsHint')}
              </p>
            </div>
          )}

          {/* Details */}
          <div className={c('section')}>
            <p className={c('section-label')}>{t('tours.form.detailSectionLabel')}</p>
            {(
              [
                ['description', 3],
                ['equipment', 2],
                ['notes', 2],
              ] as const
            ).map(([name, rows]) => (
              <div key={name} className={c('field')}>
                <label className={c('label')} htmlFor={id(name)}>
                  {tk(`tours.form.${name}Label`)}
                </label>
                <textarea
                  id={id(name)}
                  value={s[name]}
                  className={c('input textarea')}
                  rows={rows}
                  placeholder={tk(`tours.form.${name}Placeholder`)}
                  onChange={(e) => (s[name] = e.target.value)}
                />
              </div>
            ))}
          </div>

          {/* Attachments */}
          <div className={c('section')}>
            <p className={c('section-label')}>{t('tours.form.attachmentsSectionLabel')}</p>
            {/* Suggest mode: the owner's files can only be proposed for removal (D3). */}
            {isSuggest && existingAttachments.length > 0 && (
              <ul className={c('removal-list')}>
                {existingAttachments.map((att) => {
                  const marked = s.proposedRemovals.has(att.id);
                  return (
                    <li key={att.id}>
                      <button
                        type="button"
                        className={c('removal-row', { 'removal-row--marked': marked })}
                        aria-pressed={marked}
                        onClick={() => toggleProposedRemoval(att.id)}
                      >
                        <BaseIcon name={marked ? 'delete' : 'attach_file'} />
                        <span className={c('removal-name')}>{att.originalFilename}</span>
                        <span className={c('removal-hint')}>
                          {marked
                            ? t('tours.suggestions.removalMarked')
                            : t('tours.suggestions.removalPropose')}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <TourAttachmentsPicker
              tourId={isSuggest ? undefined : tourId}
              draftId={draftId ?? undefined}
              uploadTourId={attachmentTourId ?? undefined}
              attachments={attachments}
              baseCount={keptAttachmentCount}
              limitLabel={
                isSuggest
                  ? t('tours.suggestions.capHintSuggester', { max: MAX_ATTACHMENTS_PER_TOUR })
                  : undefined
              }
            />
            {attachmentOverflow > 0 && (
              <p
                className={c('attachment-overflow')}
                role="alert"
                data-testid="attachment-overflow"
              >
                {t('tours.suggestions.capOverflow', { count: attachmentOverflow })}
              </p>
            )}
          </div>
          {end}
        </div>

        {!embedded && (
          <div className={c('actions')}>
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              data-testid="cancel-btn"
              onClick={handleCancel}
            >
              {t('tours.form.cancelBtn')}
            </BaseButton>
            <BaseButton
              type="submit"
              variant="primary"
              size="sm"
              data-testid="submit-btn"
              disabled={submitBlocked}
            >
              {submitLabel}
            </BaseButton>
          </div>
        )}
      </fieldset>
    </form>
  );
}
