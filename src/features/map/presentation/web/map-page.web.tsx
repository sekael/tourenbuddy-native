import { router } from 'expo-router';
import { LngLatBounds, type Map as MapLibreMap, type Point } from 'maplibre-gl';
import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity, isOnline } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { classes } from '@/core/web/classes';
import { DialogWindow } from '@/core/web/dialog-window.web';
import { ErrorSnackbar } from '@/core/web/error-snackbar.web';
import { FeedbackSheet } from '@/core/web/feedback-sheet.web';
import { Transition } from '@/core/web/transition.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useNextTick } from '@/core/web/use-next-tick.web';
import { useReactive } from '@/core/web/use-reactive.web';
import { useScrollLock } from '@/core/web/use-scroll-lock.web';
import { sheetInset } from '@/core/web/use-sheet-inset.web';
import { useSnackbar } from '@/core/web/use-snackbar.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { spanDayKeys } from '@/features/calendar/domain/calendar-dates';
import { ContactsListSheet } from '@/features/contacts/presentation/web/contacts-list-sheet.web';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { FriendRequestsSheet } from '@/features/friendships/presentation/web/friend-requests-sheet.web';
import {
  routeStops,
  sameTrack,
  trackLine,
  withGoal,
  type DrawnTrack,
} from '@/features/map/domain/drawn-track';
import type { LngLat, Trail } from '@/features/map/domain/entities/trail';
import {
  ROUTE_STEPS,
  type RoutePlan,
  type RoutePoints,
  type RouteStep,
} from '@/features/map/domain/route-plan';
import { snapNetworkFor } from '@/features/map/domain/snap-network';
import { InboxOverlay } from '@/features/notifications/presentation/web/inbox-overlay.web';
import { useInboxStore } from '@/features/notifications/presentation/stores/inbox-store';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';
import {
  OnboardingTourBanner,
  tourSlideCls,
} from '@/features/onboarding/presentation/web/onboarding-tour-banner.web';
import {
  OnboardingWelcome,
  welcomeCls,
} from '@/features/onboarding/presentation/web/onboarding-welcome.web';
import {
  ONBOARDING_STEPS,
  type TourSurface,
} from '@/features/onboarding/presentation/web/onboarding-steps.web';
import { useOnboardingTourStore } from '@/features/onboarding/presentation/web/onboarding-tour-store.web';
import {
  useOnboardingTour,
  type StageContext,
} from '@/features/onboarding/presentation/web/use-onboarding-tour.web';
import type { TourType } from '@/features/tours/data/models/tour-type';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { TourDraft } from '@/features/tours/domain/entities/tour';
import {
  nextSegmentSeed,
  outingKey,
  outingSegments,
  spanDays,
} from '@/features/tours/domain/outing';
import type {
  CreationStage,
  StagePayload,
} from '@/features/tours/presentation/web/creation-stages.web';
import { OutingOverviewSheet } from '@/features/tours/presentation/web/outing-overview-sheet.web';
import {
  TourCreationDialog,
  type TourCreationHandle,
} from '@/features/tours/presentation/web/tour-creation-dialog.web';
import { TourInfoSheet } from '@/features/tours/presentation/web/tour-info-sheet.web';
import { TourListSheet } from '@/features/tours/presentation/web/tour-list-sheet.web';
import {
  resetTourFilters,
  showFriendTours,
  useListedTourIds,
} from '@/features/tours/presentation/web/use-tour-filters.web';
import type {
  PointChange,
  PointPick,
} from '@/features/tours/presentation/web/use-swisstopo-fill.web';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';
import { UserProfileSheet } from '@/features/user/presentation/web/user-profile-sheet.web';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { computeBarState } from './compute-bar-state.web';
import { frameBounds, frameTours, isBoundsVisible, ROUTE_ZOOM } from './frame-tour.web';
import { LocationPicker } from './location-picker.web';
import { MapActionOverlay, type MapActionOverlayHandle } from './map-action-overlay.web';
import styles from './map-page.module.css';
import { useMapStore, type DraftStage } from './map-store.web';
import { OfflineDownloadSheet } from './offline-download-sheet.web';
import { OfflineManageSheet } from './offline-manage-sheet.web';
import { OfflineRegionDraw } from './offline-region-draw.web';
import { OfflineRegionOutline } from './offline-region-outline.web';
import { planFromRoute } from './plan-from-route.web';
import { RoutePlanner } from './route-planner.web';
import { TourActionBar } from './tour-action-bar.web';
import { TourenbuddyMap } from './tourenbuddy-map.web';
import { TrackDrawer } from './track-drawer.web';
import { TrailCard } from './trail-card.web';
import { TRAIL_LOOKUP_MIN_ZOOM } from './trail-layers.web';
import { useInboxNavigation } from './use-inbox-navigation.web';
import { legEnd, skiTilesTemplate, useLegRouter } from './use-leg-router.web';
import { useTrailLookup } from './use-trail-lookup.web';

const c = classes(styles);

type PickPointType = PointPick['type'];
type OverlayName =
  | 'feedback'
  | 'profile'
  | 'contacts'
  | 'tours'
  | 'tour'
  | 'outing'
  | 'tour-creation'
  | 'friend-requests'
  | 'inbox'
  | 'offline-manage'
  | 'offline-download'
  | 'trail-info';

/** What a stage's form shows the map. */
type StageLive = {
  tourTypes?: TourType[];
  start?: { lng: number; lat: number } | null;
  end?: { lng: number; lat: number } | null;
  track?: LngLat[] | null;
};

/** The route step: which stage it plans (`stages.length` = a new one), from what. */
type PlannerState = {
  initial: RoutePoints;
  step: RouteStep;
  stage: number;
  /** A new stage's form seed (the next day's, an added segment's). */
  seed: TourDraft | null;
  /** The stage's drawing, its goal marked: the route goes on from it. */
  track: DrawnTrack | null;
  /** The stage's uploaded track, which the route keeps as it is. */
  fixedLine: LngLat[] | null;
  /** The first stage this round of planning made (or edits): "Continue" opens its details. */
  first: number;
};

const NO_ROUTE: RoutePoints = { start: null, goal: null, end: null };
// The overlays an early quit of the guided tour can reopen as they were.
const RESTORABLE_ORIGINS = new Set<OverlayName>([
  'feedback',
  'profile',
  'contacts',
  'friend-requests',
  'inbox',
  'tours',
  'offline-manage',
]);
// ponytail: mirrors `.side-drawer { width }`; measure it if the drawer ever resizes.
const SIDE_DRAWER_WIDTH = 400;
/** The draft framed this close at most: a short day out still fills the map. */
const DRAFT_ZOOM = 14;

const frames = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * The PWA's map page (`map-page.vue` there), ported line by line: the map, its controls and every
 * sheet over it (one at a time), the route step and tour creation, track drawing, offline regions,
 * the ski route lookup and the guided tour.
 */
export function MapPage() {
  'use no memo';
  const { t, i18n } = useTranslation('web');
  const locale = i18n.language;
  const isDesktop = useIsDesktop();
  const nextTick = useNextTick();

  const isPickingLocation = useMapStore((s) => s.isPickingLocation);
  const isDrawingTrack = useMapStore((s) => s.isDrawingTrack);
  const isDrawingRegion = useMapStore((s) => s.isDrawingRegion);
  const selectedTourId = useMapStore((s) => s.selectedTourId);
  const selectedOutingKey = useMapStore((s) => s.selectedOutingKey);
  const activeOverlays = useMapStore((s) => s.activeOverlays);
  const trailCard = useMapStore((s) => s.trailCard);
  const previewTourTypes = useMapStore((s) => s.previewTourTypes);
  const mapStore = useMapStore.getState;
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const isAuthenticated = useAuthStore((s) => s.user !== null);
  const reopenSignal = useOnboardingTourStore((s) => s.reopenSignal);
  const online = useStore(connectivity, (s) => s.online);
  const coveredBySheet = useStore(sheetInset, (s) => s.px);

  const s = useReactive(() => ({
    /** The picker reports a touch-screen search; read only while picking. */
    pickerSearching: false,
    map: null as MapLibreMap | null,
    mapBearing: 0,
    activeOverlay: null as OverlayName | null,
    offlineBbox: null as [number, number, number, number] | null,
    /** The crosshair pick of a saved tour's edit: which point. */
    pendingPickType: 'goal' as 'goal' | 'start' | 'end',
    stages: [] as CreationStage[],
    activeStage: 0,
    stageLive: {} as Record<string, StageLive>,
    /** The outing a new stage joins: a segment added to a tour, or a saved tour split into days. */
    segmentAnchorId: null as string | null,
    splitAnchor: false,
    dayOffset: 0,
    dayCount: null as number | null,
    planner: null as PlannerState | null,
    plannerRun: 0,
    plannerPoints: null as RoutePoints | null,
    plannerLine: null as LngLat[] | null,
    followWays: true,
    plannerCompact: false,
    drawingLive: null as DrawnTrack | null,
    speedDialOpen: false,
    /** The route step left for a ski route's card, to come back to when the card closes. */
    pausedPlanner: null as PlannerState | null,
    sheetTransition: 'sheet' as 'sheet' | 'sheet-swap',
    trackSeed: null as DrawnTrack | null,
    editDrawnTrack: null as DrawnTrack | null,
    outingOrigin: null as 'list' | null,
    isPickingForEdit: false,
    pendingFlyTo: false,
    tourDetailOrigin: null as 'list' | 'outing' | 'cal-seasons' | 'cal-planned' | null,
    tourDetailOriginDay: null as string | null,
    editContactId: null as string | null,
    editPickedPoint: null as PointPick | null,
    profileSection: undefined as 'notifications' | undefined,
    showCalendarFeatureNotice: false,
    noticeInfo: false,
    /** The draft held on the map while a save is under way, until the real markers replace it. */
    heldPreview: null as DraftStage[] | null,
    sheetMounted: false,
  }));
  const creationRef = useRef<TourCreationHandle | null>(null);
  const mapOverlayRef = useRef<MapActionOverlayHandle | null>(null);
  const tourOrigin = useRef<OverlayName | null>(null);

  // The collapsed overlay then only takes room from the keyboard and results; on phones it is
  // portaled to <body>, so the switch lives on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle(
      'picker-searching',
      isPickingLocation && s.pickerSearching,
    );
  }, [isPickingLocation, s.pickerSearching]);
  useEffect(() => () => document.documentElement.classList.remove('picker-searching'), []);

  const selectedTour =
    tours.find((x) => x.id === selectedTourId) ??
    friendTours.find((x) => x.id === selectedTourId) ??
    null;
  const allTours = [...tours, ...friendTours];
  const selectedOutingSegments = outingSegments(allTours, selectedOutingKey);

  // Overlay switching: a sheet replacing another uses `sheet-swap`, from and to the bare map the
  // full `sheet` slide (set before the change, as Vue's sync watcher did).
  function setOverlay(next: OverlayName | null) {
    if (next === s.activeOverlay) return;
    s.sheetTransition = next !== null && s.activeOverlay !== null ? 'sheet-swap' : 'sheet';
    s.activeOverlay = next;
  }

  function clearTourPreview() {
    const m = mapStore();
    m.setPreviewGoal(null);
    m.setPreviewTourTypes(null);
    m.setPreviewStart(null);
    m.setPreviewEnd(null);
    m.setPreviewTrack(null);
  }

  function closePlanner() {
    s.planner = null;
    s.plannerPoints = null;
    s.plannerLine = null;
    mapStore().setPickingLocation(false);
  }

  function resetTourCreationState() {
    s.stages = [];
    s.activeStage = 0;
    s.stageLive = {};
    s.segmentAnchorId = null;
    s.splitAnchor = false;
    s.dayOffset = 0;
    s.dayCount = null;
    s.pausedPlanner = null;
    s.followWays = true;
    s.plannerCompact = false;
    if (s.planner) closePlanner();
    // The save path holds the draft markers through the round trip (`heldPreview`).
    clearTourPreview();
  }

  /** Opens an overlay, closing any previously open overlay first. */
  function openOverlay(name: OverlayName) {
    if (s.activeOverlay === name) return;
    if (s.activeOverlay === 'tour' && name !== 'tour') {
      mapStore().selectTour(null);
      clearTourPreview();
      s.tourDetailOrigin = null;
      s.tourDetailOriginDay = null;
    }
    // Overview → segment keeps the outing's origin for the way back.
    if (s.activeOverlay === 'outing' && name !== 'outing' && name !== 'tour') {
      mapStore().selectOuting(null);
      s.outingOrigin = null;
    }
    if (s.activeOverlay === 'tour-creation' && name !== 'tour-creation') resetTourCreationState();
    setOverlay(name);
  }

  /** Closes the open overlay, cleaning up its state. */
  function closeOverlay() {
    if (s.activeOverlay === 'tour') {
      mapStore().selectTour(null);
      clearTourPreview();
      s.tourDetailOrigin = null;
      s.tourDetailOriginDay = null;
      s.outingOrigin = null;
    }
    if (s.activeOverlay === 'outing') {
      mapStore().selectOuting(null);
      s.outingOrigin = null;
    }
    if (s.activeOverlay === 'tour-creation') resetTourCreationState();
    setOverlay(null);
  }

  // --- Guided tour -----------------------------------------------------------------------------
  // The tour knows only abstract surfaces; this page owns the overlays and the menu, so it
  // translates each surface into open and close calls, starting from what is already on screen.
  async function stageTourSurface(
    surface: TourSurface,
    ctx: StageContext,
    from: TourSurface | null,
  ) {
    async function showMenu() {
      if (from === 'menu' || from === 'map-layers-panel') {
        mapOverlayRef.current?.openMenu();
        return;
      }
      closeOverlay();
      mapOverlayRef.current?.closeMenu();
      await ctx.spotlight('[data-tour="open-menu"]', 'onboarding.tour.nav.openMenu');
      mapOverlayRef.current?.openMenu();
    }
    async function openViaMenu(name: OverlayName, itemSelector: string, itemHintKey: string) {
      await showMenu();
      await ctx.spotlight(itemSelector, itemHintKey);
      mapOverlayRef.current?.closeMenu();
      openOverlay(name);
    }
    switch (surface) {
      case 'profile': {
        // The Notifications and Calendar sync rows' summaries come from fetches: load them first.
        const notifications = useNotificationsStore.getState();
        const prefsReady = notifications.prefs ? null : notifications.loadPrefs();
        await openViaMenu('profile', '[data-tour="menu-profile"]', 'onboarding.tour.nav.profile');
        await prefsReady;
        break;
      }
      case 'contacts':
        await openViaMenu(
          'contacts',
          '[data-tour="menu-contacts"]',
          'onboarding.tour.nav.contacts',
        );
        break;
      case 'friend-requests':
        if (from !== 'contacts')
          await openViaMenu(
            'contacts',
            '[data-tour="menu-contacts"]',
            'onboarding.tour.nav.contacts',
          );
        await ctx.spotlight(
          '[data-tour="open-friend-requests"]',
          'onboarding.tour.nav.friendRequests',
        );
        openOverlay('friend-requests');
        break;
      case 'tours':
        closeOverlay();
        mapOverlayRef.current?.closeMenu();
        await ctx.spotlight('[data-tour="open-tours"]', 'onboarding.tour.nav.tours');
        openOverlay('tours');
        break;
      case 'tour-bar':
        closeOverlay();
        mapOverlayRef.current?.closeMenu();
        break;
      case 'menu':
        await showMenu();
        break;
      case 'map-layers-panel':
        await showMenu();
        await ctx.spotlight('[data-tour="menu-map-layers"]', 'onboarding.tour.nav.mapLayers');
        mapOverlayRef.current?.openMapLayers();
        break;
    }
    await nextTick();
  }

  const onboardingTour = useOnboardingTour({
    steps: ONBOARDING_STEPS,
    stage: stageTourSurface,
    cleanup: () => {
      closeOverlay();
      mapOverlayRef.current?.closeMenu();
    },
    // Quit early: back to where the tour was started from, not a bare map.
    onDismissed: () => {
      if (tourOrigin.current && RESTORABLE_ORIGINS.has(tourOrigin.current))
        openOverlay(tourOrigin.current);
      tourOrigin.current = null;
    },
    // Ran to completion: on to the calendar, whose own gate decides about its tour.
    onCompleted: () => {
      mapStore().setPendingIntent({ startCalendarTour: true });
      router.push('/calendar');
    },
    saveTourStep: (n) => useUserProfileStore.getState().saveTourStep(n),
    dismissTourAtSignIn: () => useUserProfileStore.getState().dismissTourAtSignIn(),
    canAutoStart: () => {
      const profile = useUserProfileStore.getState().profile;
      return isAuthenticated && profile != null && profile.onboardingTourShowAtSignIn === true;
    },
    getResumeStep: () => useUserProfileStore.getState().profile?.onboardingTourLastStep ?? 0,
  });
  const tourRunning = onboardingTour.isRunning;
  const tourWelcome = onboardingTour.showWelcome;

  // Captured as the tour starts, before its first stage closes the overlay.
  const wasRunning = useRef(false);
  if (tourRunning && !wasRunning.current) tourOrigin.current = s.activeOverlay;
  wasRunning.current = tourRunning;

  function maybeShowCalendarFeatureNotice() {
    if (
      !onboardingTour.isRunningNow() &&
      !onboardingTour.showWelcomeNow() &&
      useUserProfileStore.getState().profile?.calendarFeatureNoticeShowAtSignIn === true
    )
      s.showCalendarFeatureNotice = true;
  }
  function dismissCalendarFeatureNotice() {
    s.showCalendarFeatureNotice = false;
    void useUserProfileStore.getState().dismissCalendarFeatureNotice();
  }

  // The map route never scrolls the document, for its whole lifetime: a canvas sliding under a
  // fixed crosshair would pick the wrong point.
  useScrollLock();

  // The guided tour's overlay lives on <body>: torn down when the page goes.
  useEffect(() => () => onboardingTour.stop(), []);

  // "Show app tour" in the profile sheet bumps this signal: resume at the last step.
  const firstSignal = useRef(reopenSignal);
  useEffect(() => {
    if (reopenSignal === firstSignal.current) return;
    onboardingTour.startTour(useUserProfileStore.getState().profile?.onboardingTourLastStep ?? 0);
    // The profile sheet closed itself before signalling: an early quit returns to it.
    tourOrigin.current = 'profile';
  }, [reopenSignal]);

  function handleTourSelectedFromList(tourId: string) {
    s.tourDetailOrigin = 'list';
    s.tourDetailOriginDay = null;
    mapStore().selectTour(tourId);
    openOverlay('tour');
  }

  function openOuting(key: string, origin: 'list' | null) {
    clearTourPreview();
    s.tourDetailOrigin = null;
    s.tourDetailOriginDay = null;
    s.outingOrigin = origin;
    // The selectedOutingKey effect swaps the sheet in.
    mapStore().selectOuting(key);
  }

  function handleTourInfoBack() {
    // A segment opened from its outing's overview goes back there.
    const key = selectedTour && outingKey(selectedTour);
    if (s.tourDetailOrigin === 'outing' && key) {
      openOuting(key, s.outingOrigin);
      return;
    }
    const origin = s.tourDetailOrigin;
    // Back to the day the detail was opened from, if the (maybe edited) span still covers it.
    const plannedDate = selectedTour?.plannedDate;
    const stored = s.tourDetailOriginDay;
    const spanKeys = plannedDate ? spanDayKeys(plannedDate, selectedTour?.endDate ?? null) : [];
    const originDay = stored && spanKeys.includes(stored) ? stored : (spanKeys[0] ?? null);
    s.tourDetailOriginDay = null;
    s.tourDetailOrigin = null;
    mapStore().selectTour(null);
    clearTourPreview();
    if (origin === 'cal-seasons' || origin === 'cal-planned') {
      router.push({
        pathname: '/calendar',
        params: {
          view: origin === 'cal-seasons' ? 'seasons' : 'planned',
          ...(origin === 'cal-planned' && originDay ? { day: originDay } : {}),
        },
      });
      return;
    }
    setOverlay('tours');
  }

  /** The navigator's outing link: the overview inherits the list origin the segment had. */
  function handleInfoSheetOpenOuting(key: string) {
    const fromList =
      s.tourDetailOrigin === 'list' ||
      (s.tourDetailOrigin === 'outing' && s.outingOrigin === 'list');
    openOuting(key, fromList ? 'list' : null);
  }

  function handleOpenSegment(tourId: string) {
    s.tourDetailOrigin = 'outing';
    s.tourDetailOriginDay = null;
    mapStore().selectTour(tourId);
  }

  function handleOutingBack() {
    mapStore().selectOuting(null);
    s.outingOrigin = null;
    setOverlay('tours');
  }

  // --- Route step --------------------------------------------------------------------------------
  function openPlanner(state: PlannerState) {
    s.planner = state;
    s.plannerLine = null;
    s.plannerRun += 1;
    mapStore().setPickingLocation(true);
  }

  function pointOf(
    location: { lng: number; lat: number } | null,
    name: string | null,
    elevation: number | null,
  ) {
    return location && { location, name: name || null, elevation, loading: false };
  }

  /** The route step for a new stage: its seed's start set, its goal next. */
  function planStage(seed: TourDraft | null, lookupStart = false, first = s.stages.length) {
    const start =
      seed &&
      pointOf(seed.startPoint, lookupStart ? null : seed.startPointName, seed.startPointElevation);
    if (start && lookupStart) start.loading = true;
    openPlanner({
      initial: { ...NO_ROUTE, start },
      step: start ? 'goal' : 'start',
      stage: s.stages.length,
      seed: seed && lookupStart ? { ...seed, startPointName: null } : seed,
      track: null,
      fixedLine: null,
      first,
    });
  }

  /** "New segment on the map": the route step for its goal, from where the outing finishes. */
  function handleAddSegment(anchorId: string) {
    const anchor = tours.find((x) => x.id === anchorId);
    if (!anchor) return;
    const segments = outingSegments(tours, outingKey(anchor));
    const prev = segments.at(-1) ?? anchor;
    closeOverlay();
    s.segmentAnchorId = anchorId;
    s.dayOffset = Math.max(segments.length, 1);
    planStage(nextSegmentSeed(prev), !prev.endPoint);
  }

  /** "Split into daily stages": the tour keeps its first day, the next one's route step opens. */
  function handleSplitTour(anchorId: string) {
    const anchor = tours.find((x) => x.id === anchorId);
    if (!anchor?.plannedDate || !anchor.endDate) return;
    const segments = outingSegments(tours, outingKey(anchor));
    closeOverlay();
    s.segmentAnchorId = anchorId;
    s.splitAnchor = true;
    s.dayOffset = Math.max(segments.length, 1);
    s.dayCount = s.dayOffset - 1 + spanDays({ start: anchor.plannedDate, end: anchor.endDate });
    planStage(nextSegmentSeed({ ...anchor, endDate: null }), !anchor.endPoint);
  }

  /** "Plan as tour" on a ski route: the creation form on its summit, its line as the track. */
  async function handlePlanFromRoute(trail: Trail) {
    const plan = trail.route && (await planFromRoute(trail.route, trail.lines, locale));
    if (!plan) return;
    const { goal, seed, track } = plan;
    closeOverlay();
    s.stages = [{ key: crypto.randomUUID(), goal, seed, picks: null, drawnTrack: track }];
    openOverlay('tour-creation');
  }

  function handleEditContact(contactId: string) {
    s.editContactId = contactId;
    openOverlay('contacts');
  }

  function handleContactsClose() {
    s.editContactId = null;
    closeOverlay();
  }

  /** A friend's contact detail → their tours: the list on Friends, filtered to them. */
  function handleShowFriendTours(userId: string) {
    s.editContactId = null;
    showFriendTours(userId);
    openOverlay('tours');
  }

  // The map shows what a narrowed list shows, only while the list itself is open.
  const listedTourIds = useListedTourIds();
  const mapListedTourIds = s.activeOverlay === 'tours' ? listedTourIds : null;

  const { openEntry: openInboxEntry, snackbar: inboxSnackbar } = useInboxNavigation({
    overlay: (name) => openOverlay(name),
    tour: (tourId) => {
      closeOverlay();
      mapStore().selectTour(tourId);
    },
  });

  function openNotificationSettings() {
    s.profileSection = 'notifications';
    openOverlay('profile');
  }

  function handleOpenFriendRequests() {
    s.editContactId = null;
    openOverlay('friend-requests');
  }

  /** The map area the open drawer (desktop) or sheet (phone) covers: camera moves frame beside it. */
  const mapCovered = isDesktop
    ? s.activeOverlay
      ? { right: SIDE_DRAWER_WIDTH }
      : {}
    : { bottom: coveredBySheet };
  const latest = useRef({ selectedTour, selectedOutingSegments, mapCovered });
  latest.current = { selectedTour, selectedOutingSegments, mapCovered };

  /** Frame the open tour, or every segment of the open outing. */
  async function flyToSelectedTour() {
    if (!latest.current.selectedTour && latest.current.selectedOutingSegments.length === 0) return;
    await nextTick();
    // The sheet may still be waiting for the previous one to leave: deferred until it mounts.
    if (!isDesktop && !s.sheetMounted) {
      s.pendingFlyTo = true;
      return;
    }
    s.pendingFlyTo = false;
    // Let the sheet fit its content first, so the camera frames against its resting height.
    if (!isDesktop) await frames();
    const {
      selectedTour: tour,
      selectedOutingSegments: segments,
      mapCovered: covered,
    } = latest.current;
    const framed = tour ? [tour] : segments;
    if (!s.map || framed.length === 0) return;
    frameTours(s.map, framed, covered);
  }

  function handleResetBearing() {
    s.map?.easeTo({ bearing: 0, pitch: 0, duration: 300 });
  }

  function handleTourClicked(tourId: string) {
    // A tap while drawing or planning sets a point there instead; beside the creation form it
    // must not swap the unsaved tour for another.
    if (mapStore().isDrawingTrack || s.planner || s.activeOverlay === 'tour-creation') return;
    const all = [...useToursStore.getState().tours, ...useToursStore.getState().friendTours];
    const tour = all.find((x) => x.id === tourId);
    const key = tour ? outingKey(tour) : null;
    const { selectedOutingKey: openKey } = mapStore();
    const open = all.find((x) => x.id === mapStore().selectedTourId);
    const focused = openKey ?? (open ? outingKey(open) : null);
    // A segment of an outing not open yet shows the whole outing first; inside it, the segment.
    if (key && key !== focused && outingSegments(all, key).length > 0) {
      openOuting(key, null);
      return;
    }
    if (key && key === openKey) s.tourDetailOrigin = 'outing';
    mapStore().selectTour(tourId);
    openOverlay('tour');
  }

  /** The crosshair pick of a saved tour's edit; the form names the point and looks up its height. */
  function handleLocationConfirmed({
    name,
    ...location
  }: {
    lng: number;
    lat: number;
    name?: string;
  }) {
    mapStore().setPickingLocation(false);
    const pickType = s.pendingPickType as PickPointType;
    s.isPickingForEdit = false;
    s.pendingPickType = 'goal';
    if (pickType === 'goal') mapStore().setPreviewGoal(location);
    s.editPickedPoint = { type: pickType, location, name };
  }

  function handleLocationCancelled() {
    mapStore().setPickingLocation(false);
    s.isPickingForEdit = false;
    s.pendingPickType = 'goal';
  }

  /** "+" (bar or list): a new tour starts on the map, with its start. */
  function startNewTour() {
    closeOverlay();
    mapStore().selectTour(null);
    resetTourCreationState();
    planStage(null);
  }

  /** The form's Pick or Change: back to the route step on that point, with the stage's points. */
  function handlePickPoint(type: RouteStep) {
    planSavedStage(s.activeStage, type, s.activeStage);
  }

  /** The route step for a stage there is: its points, and its track to go on from. */
  function planSavedStage(index: number, step: RouteStep, first: number) {
    const route = creationRef.current?.routeOf(index);
    const stage = s.stages[index];
    if (!route || !stage) return;
    const track = route.drawing && withGoal(route.drawing, [stage.goal.lng, stage.goal.lat]);
    openPlanner({
      initial: {
        goal: pointOf(stage.goal, route.goal.name, route.goal.elevation),
        start:
          route.start && pointOf(route.start.location, route.start.name, route.start.elevation),
        end: route.end && pointOf(route.end.location, route.end.name, route.end.elevation),
      },
      step,
      stage: index,
      seed: null,
      track,
      fixedLine: route.fixedLine ?? (route.drawing && !track ? trackLine(route.drawing) : null),
      first,
    });
  }

  /** What moved in the route step, for the form: a found name and height go along. */
  function changedPoints(before: RoutePoints, after: RoutePoints): PointChange[] {
    return ROUTE_STEPS.flatMap((type): PointChange[] => {
      const [was, now] = [before[type], after[type]];
      if (!now) return was && type !== 'goal' ? [{ type, location: null }] : [];
      if (
        was &&
        !was.loading &&
        was.location.lng === now.location.lng &&
        was.location.lat === now.location.lat
      )
        return [];
      const found = now.loading ? {} : { name: now.name ?? undefined, elevation: now.elevation };
      return [{ type, location: now.location, ...found }];
    });
  }

  /** The route step's plan onto its stage (a new one is added), its line along the ways as track. */
  function commitPlan(state: PlannerState, { points, track }: RoutePlan): boolean {
    const goal = points.goal?.location;
    if (!goal) return false;
    const picks = changedPoints(state.initial, points);
    let drawnTrack: DrawnTrack | null = null;
    if (track && !(state.track && sameTrack(track, state.track))) drawnTrack = track;
    else if (!track && state.track && !state.fixedLine) drawnTrack = { points: [], legs: [] };
    if (state.stage >= s.stages.length)
      s.stages = [
        ...s.stages,
        { key: crypto.randomUUID(), goal, seed: state.seed, picks, drawnTrack },
      ];
    else
      s.stages = s.stages.map((x, i) =>
        i === state.stage ? { ...x, goal, picks, drawnTrack: drawnTrack ?? x.drawnTrack } : x,
      );
    openOverlay('tour-creation');
    return true;
  }

  function handlePlannerDone(plan: RoutePlan) {
    const state = s.planner;
    if (!state || !commitPlan(state, plan)) return;
    // A split span goes on day by day: the next day's route step follows at once.
    if (
      state.seed &&
      state.stage === s.stages.length - 1 &&
      s.dayCount &&
      s.dayOffset + s.stages.length < s.dayCount
    ) {
      void planNextDay(state, plan.points);
      return;
    }
    closePlanner();
    s.activeStage = Math.min(state.first, s.stages.length - 1);
    void frameDraft();
  }

  /** "+ Next day" in the route step: this day kept, the next one planned from where it ends. */
  function handlePlannerNextDay(plan: RoutePlan) {
    const state = s.planner;
    if (state && commitPlan(state, plan)) void planNextDay(state, plan.points);
  }

  async function planNextDay(state: PlannerState, { goal, end }: RoutePoints) {
    const index = state.stage;
    s.activeStage = index;
    // The day's form is there from the next render on: the next day is seeded from it.
    await nextTick();
    const draft = creationRef.current?.snapshotOf(index) ?? state.seed;
    if (!draft || !goal) {
      closePlanner();
      return;
    }
    planStage(
      nextSegmentSeed({
        ...draft,
        name: goal.name ?? draft.name ?? '',
        elevation: goal.elevation,
        endPoint: end?.location ?? null,
        endPointName: end?.name ?? null,
        endPointElevation: end?.elevation ?? null,
        goal: goal.location,
      }),
      !end && !goal.name,
      state.first,
    );
  }

  /** A day's pill in the route step: this day kept (or dropped without a goal), that one opened. */
  async function handlePlannerSelectDay(index: number, plan: RoutePlan) {
    const state = s.planner;
    if (!state) return;
    commitPlan(state, plan);
    s.activeStage = index;
    await nextTick();
    if (s.planner === state) planSavedStage(index, 'goal', Math.min(state.first, index));
    if (s.planner === state) closePlanner();
  }

  /** Leaving the route step: back to the form as it was, or with none yet, no tour at all. */
  function handlePlannerCancel() {
    closePlanner();
    if (s.stages.length === 0) resetTourCreationState();
  }

  /** "+ Next day", or a span split into days: the route step of the day after the last stage. */
  function handleNextDay(split?: number) {
    const last = s.stages.length - 1;
    const draft = creationRef.current?.snapshotOf(last);
    const stage = s.stages[last];
    if (!draft || !stage) return;
    if (split) s.dayCount = s.dayOffset + last + split;
    // Starting at the goal, the day takes the goal's place name, not the tour's.
    const place = creationRef.current?.routeOf(last)?.goal.place;
    planStage(
      nextSegmentSeed({ ...draft, name: place ?? draft.name, goal: stage.goal }),
      !draft.endPoint && !place,
      s.stages.length,
    );
  }

  /** The ways a moved start's leg follows: the stage's own activities and the shown trail layers. */
  const handoverTypes = useRef<readonly TourType[]>([]);
  const handoverRouter = useLegRouter({
    network: () => snapNetworkFor(mapStore().activeOverlays, handoverTypes.current),
    skiTemplate: () => skiTilesTemplate(s.map),
    maxTiles: 64,
  });

  /** The day before now ends elsewhere: this day starts there too, its first leg along the ways. */
  async function handleHandoverMoved(
    index: number,
    {
      location,
      name,
      elevation,
    }: { location: { lng: number; lat: number }; name: string; elevation: number | null },
  ) {
    const key = s.stages[index]?.key;
    const drawing = creationRef.current?.routeOf(index)?.drawing;
    s.stages = s.stages.map((x) =>
      x.key === key
        ? { ...x, picks: [{ type: 'start', location, name: name || undefined, elevation }] }
        : x,
    );
    const from: LngLat = [location.lng, location.lat];
    if (
      !key ||
      !drawing ||
      drawing.points.length < 2 ||
      drawing.goal === 0 ||
      isSameGoal(location, { lng: drawing.points[0]![0], lat: drawing.points[0]![1] }, 1)
    )
      return;
    handoverTypes.current = s.stageLive[key]?.tourTypes ?? [];
    const leg = await handoverRouter
      .between(from, drawing.points[1]!, ['stop', legEnd(1, drawing.points.length, drawing.goal)])
      .catch(() => [from, drawing.points[1]!]);
    const at = s.stages.findIndex((x) => x.key === key);
    // Drawn anew meanwhile: that drawing stands.
    if (at < 0 || creationRef.current?.routeOf(at)?.drawing !== drawing) return;
    const track: DrawnTrack = {
      ...drawing,
      points: [from, ...drawing.points.slice(1)],
      legs: [leg, ...drawing.legs.slice(1)],
    };
    s.stages = s.stages.map((x) => (x.key === key ? { ...x, drawnTrack: track } : x));
  }

  /** A later stage dropped: the one before it shows. */
  function handleRemoveStage(index: number) {
    const key = s.stages[index]?.key;
    s.stages = s.stages.filter((_, i) => i !== index);
    if (key) {
      const { [key]: _gone, ...rest } = s.stageLive;
      s.stageLive = rest;
    }
    s.activeStage = Math.max(0, index - 1);
  }

  function handleStageChange(index: number, change: StageLive) {
    const key = s.stages[index]?.key;
    if (key) s.stageLive = { ...s.stageLive, [key]: { ...s.stageLive[key], ...change } };
  }

  const creationTitle = s.splitAnchor
    ? t('tours.creation.splitTitle')
    : s.segmentAnchorId
      ? t('tours.outing.addTitle')
      : t('tours.creation.title');

  /** "Day 2" past the first stage; "Day 2 of 3" while laying out a split span. */
  function dayTitle(stage: number) {
    const n = s.dayOffset + stage + 1;
    return s.dayCount && n <= s.dayCount
      ? t('tours.creation.dayOf', { n, count: s.dayCount })
      : t('tours.creation.day', { n });
  }
  const planner = s.planner;
  const plannerTitle = !planner
    ? ''
    : planner.stage > 0 || s.segmentAnchorId
      ? dayTitle(planner.stage)
      : t('tours.creation.title');
  const plannerDays = Array.from(
    { length: planner ? Math.max(s.stages.length, planner.stage + 1) : 0 },
    (_, i) => t('tours.creation.day', { n: s.dayOffset + i + 1 }),
  );
  const plannerKey = planner && s.stages[planner.stage]?.key;
  const plannerTourTypes =
    (plannerKey && s.stageLive[plannerKey]?.tourTypes) || planner?.seed?.tourTypes || [];

  /** The map's draft: every stage, the planned one as the route step has it. */
  function computeDraftStages(): DraftStage[] {
    const out: DraftStage[] = s.stages.map((x) => {
      const live = s.stageLive[x.key];
      return {
        goal: x.goal,
        startPoint: live?.start ?? null,
        endPoint: live?.end ?? null,
        tourTypes: live?.tourTypes ?? x.seed?.tourTypes ?? [],
        legs: null,
        track: live?.track ?? null,
      };
    });
    const state = s.planner;
    const points = s.plannerPoints;
    if (state && points) {
      const base = out[state.stage] ?? {
        tourTypes: state.seed?.tourTypes ?? [],
        legs: null,
        track: null,
      };
      out[state.stage] = {
        ...base,
        goal: points.goal?.location ?? null,
        startPoint: points.start?.location ?? null,
        endPoint: points.end?.location ?? null,
        track: s.plannerLine,
      };
      // The next day starting where this one ends shows its start moving along.
      const next = out[state.stage + 1];
      const [was, now] = [state.initial.end ?? state.initial.goal, points.end ?? points.goal];
      if (next?.startPoint && was && now && isSameGoal(next.startPoint, was.location, 1))
        out[state.stage + 1] = { ...next, startPoint: now.location };
    }
    // A drawing moves its stage's start, goal and end as it goes; the drawer draws the line itself.
    const live = s.drawingLive;
    const drawn = out[s.activeStage];
    if (live && drawn) {
      const ll = (p: LngLat | null) => p && { lng: p[0], lat: p[1] };
      const stops =
        live.goal != null && live.points.length > live.goal
          ? routeStops({ ...live, goal: live.goal })
          : null;
      out[s.activeStage] = stops
        ? {
            ...drawn,
            goal: ll(stops.goal),
            startPoint: ll(stops.start),
            endPoint: ll(stops.end),
            track: null,
          }
        : { ...drawn, track: null };
    }
    if (out.length < 2) return out;
    const current = state?.stage ?? s.activeStage;
    return out.map((x, i) => ({
      ...x,
      active: i === current,
      label: t('tours.creation.dayGoal', { n: s.dayOffset + i + 1 }),
    }));
  }
  const draftStages = computeDraftStages();
  const shownDraft = s.heldPreview ?? draftStages;
  const shownDraftKey = JSON.stringify(shownDraft);
  useEffect(() => {
    mapStore().setPreviewStages(shownDraft);
  }, [shownDraftKey]);
  // The active stage's activities pick what a drawing follows.
  const activeTypes = s.stageLive[s.stages[s.activeStage]?.key ?? '']?.tourTypes;
  useEffect(() => {
    if (s.stages.length > 0) mapStore().setPreviewTourTypes(activeTypes ?? []);
  }, [activeTypes]);

  /** On desktop the drawer covers the map's right side: the draft fills the map beside it. */
  async function frameDraft() {
    if (!isDesktop) return;
    await nextTick();
    const points: LngLat[] = computeDraftStages().flatMap((x) => [
      ...[x.goal, x.startPoint, x.endPoint].flatMap((p) => (p ? [[p.lng, p.lat] as LngLat] : [])),
      ...(x.track ?? []),
    ]);
    if (!s.map || points.length === 0) return;
    const bounds = points.reduce((b, p) => b.extend(p), new LngLatBounds());
    frameBounds(s.map, bounds, latest.current.mapCovered, { maxZoom: DRAFT_ZOOM });
  }

  function handleInfoSheetPickPoint(type: 'start' | 'end' | 'goal') {
    s.isPickingForEdit = true;
    s.pendingPickType = type;
    mapStore().setPickingLocation(true);
  }

  function handlePointConsumed() {
    s.editPickedPoint = null;
    s.editDrawnTrack = null;
  }

  /** The form asks to draw its track, going on from its current one. */
  function handleDrawTrack(seed: DrawnTrack | null, forEdit = false) {
    s.isPickingForEdit = forEdit;
    s.trackSeed = seed;
    mapStore().setDrawingTrack(true);
  }

  function handleTrackDrawn(track: DrawnTrack) {
    mapStore().setDrawingTrack(false);
    s.trackSeed = null;
    s.drawingLive = null;
    if (s.isPickingForEdit) s.editDrawnTrack = track;
    else {
      // The route's goal dragged elsewhere in the drawing moves the stage's goal: named there anew.
      const at = track.goal == null ? null : track.points[track.goal];
      const goal = at && { lng: at[0], lat: at[1] };
      s.stages = s.stages.map((x, i) => {
        if (i !== s.activeStage) return x;
        const moved = goal && !isSameGoal(goal, x.goal, 1);
        return moved
          ? { ...x, goal, picks: [{ type: 'goal', location: goal }], drawnTrack: track }
          : { ...x, drawnTrack: track };
      });
    }
    s.isPickingForEdit = false;
  }

  function handleTrackCancelled() {
    mapStore().setDrawingTrack(false);
    s.trackSeed = null;
    s.drawingLive = null;
    s.isPickingForEdit = false;
  }

  async function handleEditModeChange(editing: boolean) {
    if (!editing) {
      // Cancel or save: drop the previews and recenter on the (maybe updated) tour.
      clearTourPreview();
      await flyToSelectedTour();
    }
  }

  // A working start or end is a draft marker only where it differs from the saved point.
  function draftIfChanged(
    point: { lng: number; lat: number } | null,
    saved: { lng: number; lat: number } | null,
  ) {
    if (!point) return null;
    if (!saved) return point;
    return isSameGoal(point, saved) ? null : point;
  }

  // The map's own bottom messages: ski route lookups, a tour saved twice.
  const notice = useSnackbar();
  function showNotice(message: string, info: boolean) {
    s.noticeInfo = info;
    notice.show(message);
  }

  // --- Ski route lookup --------------------------------------------------------------------------
  const trailLookup = useTrailLookup({
    map: () => s.map,
    locale: () => i18n.language,
    onError: () => showNotice(t('map.trail.lookupError'), false),
  });
  // A ski tile failing without HTTP status while online: the dataset moved on.
  useEffect(() => {
    const map = s.map;
    if (!map) return;
    const onError = (e: { sourceId?: string; error?: { status?: number } }) => {
      if (isOnline()) trailLookup.onMapError(e);
    };
    map.on('error', onError as never);
    return () => void map.off('error', onError as never);
  }, [s.map]);

  /** A new tour's route step: a tap on a marked ski route opens its card, to plan it as the tour. */
  const routesTappableInPick =
    !!s.planner &&
    s.stages.length === 0 &&
    !s.segmentAnchorId &&
    activeOverlays.includes('ski') &&
    online;
  const routesTappable = useRef(routesTappableInPick);
  routesTappable.current = routesTappableInPick;

  /** A tap the route step leaves to the page: one on a marked ski route, where the card opens. */
  function plannerRouteHit(point: Point) {
    return (
      routesTappable.current &&
      (s.map?.getZoom() ?? 0) >= TRAIL_LOOKUP_MIN_ZOOM &&
      trailLookup.hitTest(point).ids.length > 0
    );
  }

  async function openRouteFromPick(point: Point) {
    const hits = await trailLookup.lookup(point);
    const state = s.planner;
    if (!hits?.candidates.length || !routesTappable.current || !state) return;
    const points = s.plannerPoints ?? state.initial;
    s.pausedPlanner = {
      ...state,
      initial: points,
      step: points.goal ? 'end' : points.start ? 'goal' : 'start',
    };
    closePlanner();
    mapStore().showTrails(hits.candidates, hits.more);
    openOverlay('trail-info');
  }

  function handleTrailCardClose() {
    const resume = s.pausedPlanner;
    closeOverlay();
    if (resume) openPlanner(resume);
  }

  // The trail card is the one sheet about the map, so a tap looks up again; every other sheet
  // keeps "tap the map = close".
  async function handleMapBackgroundClick({ point }: { point: Point }) {
    const m = mapStore();
    if (m.isPickingLocation || m.isDrawingRegion) {
      if (plannerRouteHit(point)) await openRouteFromPick(point);
      return;
    }
    // The creation form beside the map keeps its unsaved tour: a stray click is no cancel.
    if (s.activeOverlay === 'tour-creation') return;
    const map = s.map;
    const otherSheet = s.activeOverlay !== null && s.activeOverlay !== 'trail-info';
    if (
      otherSheet ||
      !map ||
      !m.activeOverlays.includes('ski') ||
      map.getZoom() < TRAIL_LOOKUP_MIN_ZOOM
    ) {
      closeOverlay();
      return;
    }
    // Offline the routes still render but their details can't load.
    if (!isOnline()) {
      if (trailLookup.hitTest(point).ids.length > 0) showNotice(t('map.trail.offline'), true);
      closeOverlay();
      return;
    }
    const hits = await trailLookup.lookup(point);
    // null: failed or superseded. Another sheet opened meanwhile wins.
    if (!hits || (s.activeOverlay !== null && s.activeOverlay !== 'trail-info')) return;
    if (hits.candidates.length === 0) {
      closeOverlay();
      return;
    }
    mapStore().showTrails(hits.candidates, hits.more);
    openOverlay('trail-info');
  }

  // --- Offline maps: menu → manage sheet → draw a region or the whole map → download sheet --------
  function handleStartDrawRegion() {
    closeOverlay();
    mapStore().setDrawingRegion(true);
  }
  function handleRegionDrawn(bbox: [number, number, number, number]) {
    mapStore().setDrawingRegion(false);
    s.offlineBbox = bbox;
    openOverlay('offline-download');
  }
  function handleRegionDrawCancel() {
    mapStore().setDrawingRegion(false);
    openOverlay('offline-manage');
  }
  function handleDownloadWhole(bbox: [number, number, number, number]) {
    s.offlineBbox = bbox;
    openOverlay('offline-download');
  }
  function handleOfflineDownloadDone() {
    s.offlineBbox = null;
    openOverlay('offline-manage');
  }

  const barState = computeBarState({
    activeOverlay: s.activeOverlay,
    isPickingLocation,
    speedDialOpen: s.speedDialOpen,
    isAuthenticated,
  });

  function dismissActive() {
    closeOverlay();
    mapOverlayRef.current?.closeMenu();
  }
  function handleBarTours() {
    if (barState.toursAction === 'dismiss') {
      dismissActive();
      return;
    }
    openOverlay('tours');
  }
  function handleBarAddTour() {
    if (barState.addTourAction === 'dismiss') {
      dismissActive();
      return;
    }
    if (barState.addTourAction === 'pick') startNewTour();
  }

  async function handleTourCreated(payloads: StagePayload[]) {
    // The anchor first, before closing resets it; the draft stays on the map through the save
    // until the real markers replace it, and goes on failure too.
    const anchorId = s.segmentAnchorId;
    const keepFirstDay = s.splitAnchor;
    const days = (anchorId ? s.dayOffset : 0) + payloads.length;
    const shown = computeDraftStages();
    closeOverlay();
    s.heldPreview = shown;
    try {
      await performCreate(payloads, anchorId, keepFirstDay, days);
    } finally {
      s.heldPreview = null;
    }
  }

  async function performCreate(
    payloads: StagePayload[],
    anchorId: string | null,
    keepFirstDay: boolean,
    days: number,
  ) {
    const toursStore = useToursStore.getState();
    const [only] = payloads;
    if (payloads.length === 1 && only && !anchorId) {
      // The same tour again (every field left as it came): open the one there is, not a copy.
      const twin = !useTourAttachmentsStore.getState().preUploadedByDraft[only.draftId]?.length
        ? await toursStore.dropIfDuplicate(only.draft, only.goal)
        : null;
      if (twin) {
        mapStore().selectTour(twin.id);
        showNotice(t('tours.creation.alreadyThere'), true);
        return;
      }
      await createStage(only, undefined);
      return;
    }
    // Stages: a split tour keeps its first day, the anchor joins (or mints) the outing, then each
    // stage after the last segment, in order, so a cancelled layout never leaves an outing behind.
    if (anchorId && keepFirstDay) await toursStore.keepFirstDay(anchorId);
    const outing = anchorId
      ? await toursStore.ensureOuting(anchorId)
      : { id: crypto.randomUUID(), name: null, position: 0 };
    if (!outing) return;
    const first = anchorId ? useToursStore.getState().nextInOuting(outing).position : 0;
    let lastId: string | null = null;
    for (const [i, stage] of payloads.entries())
      lastId = (await createStage(stage, { ...outing, position: first + i }, false)) ?? lastId;
    // One new segment opens as itself; a laid-out trip opens on its overview.
    const userId = useAuthStore.getState().user?.id;
    if ((payloads.length > 1 || keepFirstDay) && userId) {
      openOuting(outingKey({ userId, outing })!, null);
      showNotice(t('tours.creation.savedDays', { count: days }), true);
    } else if (lastId) mapStore().selectTour(lastId);
  }

  /** Create one stage; its attachments' rows follow (the bytes are already in Storage). */
  async function createStage(stage: StagePayload, outing: TourDraft['outing'], select = true) {
    const id = await useToursStore
      .getState()
      .createTourFromDraft(
        outing ? { ...stage.draft, outing } : stage.draft,
        stage.goal,
        stage.preUploadedTourId,
      );
    if (!id) return null;
    if (select) mapStore().selectTour(id);
    if (stage.draftId) await useTourAttachmentsStore.getState().commitStaged(stage.draftId, id);
    return id;
  }

  // --- Watchers ----------------------------------------------------------------------------------
  const first = useRef(true);
  // Leaving the tour list resets its search and filters; a tour or outing opened from it is "in" it.
  useEffect(() => {
    const name = s.activeOverlay;
    if (name !== 'tours' && name !== 'tour' && name !== 'outing') resetTourFilters();
    if (name !== 'profile') s.profileSection = undefined;
    // One rule for every way out of the trail card: close, a tour, any other sheet.
    if (name !== 'trail-info') {
      mapStore().clearTrails();
      s.pausedPlanner = null;
    }
  }, [s.activeOverlay]);
  // Keep the open sheet in step when the selection changes elsewhere.
  useEffect(() => {
    if (first.current) return;
    if (selectedTourId) setOverlay('tour');
    else if (s.activeOverlay === 'tour' && !mapStore().selectedOutingKey) setOverlay(null);
  }, [selectedTourId]);
  useEffect(() => {
    if (first.current) return;
    if (selectedOutingKey) setOverlay('outing');
    else if (s.activeOverlay === 'outing' && !mapStore().selectedTourId) setOverlay(null);
  }, [selectedOutingKey]);
  // Close the overview when its outing dissolves; deselect a tour a refetch removed.
  useEffect(() => {
    if (selectedOutingKey && selectedOutingSegments.length === 0) mapStore().selectOuting(null);
  }, [selectedOutingSegments.length, selectedOutingKey]);
  useEffect(() => {
    if (!selectedTour && selectedTourId !== null) mapStore().selectTour(null);
  }, [selectedTour, selectedTourId]);
  useEffect(() => {
    if (s.sheetMounted && s.pendingFlyTo) void flyToSelectedTour();
  }, [s.sheetMounted]);
  useEffect(() => {
    if (selectedTourId || selectedOutingKey) void flyToSelectedTour();
  }, [selectedTourId, selectedOutingKey]);
  useEffect(() => {
    const map = s.map;
    if (!map) return;
    const update = () => (s.mapBearing = map.getBearing());
    map.on('rotate', update);
    map.on('rotateend', update);
    update();
    return () => {
      map.off('rotate', update);
      map.off('rotateend', update);
    };
  }, [s.map]);
  // Frame what the trail card highlights beside the sheet or drawer, when it isn't fully visible;
  // a route chosen from the list is always framed, to fill that area.
  useEffect(() => {
    if (!trailCard) return;
    void (async () => {
      await nextTick();
      if (!isDesktop) await frames();
      const card = mapStore().trailCard;
      const map = s.map;
      if (!card || !map) return;
      const bounds = new LngLatBounds();
      for (const trail of card.candidates)
        if (!card.selectedId || trail.id === card.selectedId)
          trail.lines.forEach((line) => line.forEach((p) => bounds.extend(p)));
      const covered = latest.current.mapCovered;
      const chosenFromList = !!card.selectedId && card.candidates.length > 1;
      if (bounds.isEmpty()) return;
      if (chosenFromList) frameBounds(map, bounds, covered, { maxZoom: ROUTE_ZOOM });
      else if (!isBoundsVisible(map, bounds, covered)) frameBounds(map, bounds, covered);
    })();
  }, [trailCard?.candidates, trailCard?.selectedId]);

  // Mounted: the guided tour's welcome (gated on the profile alone, so it shows at once), the
  // calendar notice, the data, then a one-shot handoff from the calendar route.
  useEffect(() => {
    first.current = false;
    void (async () => {
      const profileStore = useUserProfileStore.getState();
      if (!profileStore.profile) await profileStore.loadProfile();
      onboardingTour.maybeStartTour();
      maybeShowCalendarFeatureNotice();
      await Promise.all([
        useToursStore.getState().loadTours(),
        useContactsStore.getState().loadContacts(),
        useTourSuggestionsStore.getState().load(),
        useInboxStore.getState().load(),
      ]);
      const intent = mapStore().consumePendingIntent();
      if (intent?.openTours) setOverlay('tours');
      else if (intent?.selectTourId) {
        s.tourDetailOrigin = intent.origin ?? null;
        s.tourDetailOriginDay = intent.originDay ?? null;
        mapStore().selectTour(intent.selectTourId);
      }
    })();
  }, []);

  // --- Render ------------------------------------------------------------------------------------
  const sheetHosts = useRef(0);
  // Stable: a new callback each render makes React detach and re-attach it on every commit, and
  // the toggling state re-renders forever. Counted, so a tour → outing swap (old detaches, new
  // attaches in one commit) stays mounted.
  const sheetRef = useRef((node: HTMLDivElement | null) => {
    sheetHosts.current += node ? 1 : -1;
    queueMicrotask(() => (s.sheetMounted = sheetHosts.current > 0));
  }).current;
  const overlay = s.activeOverlay;
  let sheet: React.ReactElement | null = null;
  if (selectedTour && overlay === 'tour')
    sheet = (
      <div key="tour" ref={sheetRef} className="sheet-host">
        <TourInfoSheet
          tour={selectedTour}
          editPickedPoint={s.editPickedPoint}
          showBack={s.tourDetailOrigin !== null}
          backText={s.tourDetailOrigin === 'outing' ? t('tours.outing.backToOuting') : undefined}
          activePickType={s.isPickingForEdit ? s.pendingPickType : null}
          editDrawnTrack={s.editDrawnTrack}
          onClose={closeOverlay}
          onBack={handleTourInfoBack}
          onPickPoint={handleInfoSheetPickPoint}
          onDrawTrack={(seed) => handleDrawTrack(seed, true)}
          onTrackChange={(line) => mapStore().setPreviewTrack(line)}
          onPointConsumed={handlePointConsumed}
          onEditModeChange={(editing) => void handleEditModeChange(editing)}
          onEditContact={handleEditContact}
          onTourTypesChange={(types) => mapStore().setPreviewTourTypes(types)}
          onStartPointChange={(p) =>
            mapStore().setPreviewStart(draftIfChanged(p, selectedTour.startPoint ?? null))
          }
          onEndPointChange={(p) =>
            mapStore().setPreviewEnd(draftIfChanged(p, selectedTour.endPoint ?? null))
          }
          onOpenOuting={handleInfoSheetOpenOuting}
          onAddSegment={handleAddSegment}
          onSplitDays={handleSplitTour}
        />
      </div>
    );
  else if (selectedOutingKey && overlay === 'outing')
    sheet = (
      <div key="outing" ref={sheetRef} className="sheet-host">
        <OutingOverviewSheet
          outingKey={selectedOutingKey}
          showBack={s.outingOrigin === 'list'}
          onClose={closeOverlay}
          onBack={handleOutingBack}
          onOpenSegment={handleOpenSegment}
          onAddSegmentNew={handleAddSegment}
        />
      </div>
    );
  else if (overlay === 'feedback')
    sheet = (
      <div key="feedback" className="sheet-host">
        <FeedbackSheet onClose={closeOverlay} />
      </div>
    );
  else if (overlay === 'profile')
    sheet = (
      <div key="profile" className="sheet-host">
        <UserProfileSheet initialSection={s.profileSection} onClose={closeOverlay} />
      </div>
    );
  else if (overlay === 'contacts')
    sheet = (
      <div key="contacts" className="sheet-host">
        <ContactsListSheet
          initialContactId={s.editContactId}
          onClose={handleContactsClose}
          onOpenFriendRequests={handleOpenFriendRequests}
          onShowFriendTours={handleShowFriendTours}
        />
      </div>
    );
  else if (overlay === 'friend-requests')
    sheet = (
      <div key="friend-requests" className="sheet-host">
        <FriendRequestsSheet onClose={closeOverlay} onBack={() => openOverlay('contacts')} />
      </div>
    );
  else if (overlay === 'inbox')
    sheet = (
      <div key="inbox" className="sheet-host">
        <InboxOverlay
          onClose={closeOverlay}
          onOpen={openInboxEntry}
          onOpenSettings={openNotificationSettings}
        />
      </div>
    );
  else if (overlay === 'tours')
    sheet = (
      <div key="tours" className="sheet-host">
        <TourListSheet
          onClose={closeOverlay}
          onSelectTour={handleTourSelectedFromList}
          onSelectOuting={(key) => openOuting(key, 'list')}
          onAddTour={startNewTour}
        />
      </div>
    );
  else if (overlay === 'offline-manage')
    sheet = (
      <div key="offline-manage" className="sheet-host">
        <OfflineManageSheet
          onClose={closeOverlay}
          onStartDraw={handleStartDrawRegion}
          onDownloadWhole={handleDownloadWhole}
        />
      </div>
    );
  else if (overlay === 'offline-download' && s.offlineBbox)
    sheet = (
      <div key="offline-download" className="sheet-host">
        <OfflineDownloadSheet
          bbox={s.offlineBbox}
          onClose={handleOfflineDownloadDone}
          onDone={handleOfflineDownloadDone}
        />
      </div>
    );
  else if (overlay === 'trail-info' && trailCard)
    sheet = (
      <div key="trail-info" className="sheet-host">
        <TrailCard
          onClose={handleTrailCardClose}
          onPlan={(trail) => void handlePlanFromRoute(trail)}
        />
      </div>
    );
  else if (overlay === 'tour-creation' && s.stages.length > 0)
    sheet = (
      <div key="tour-creation" className="sheet-host">
        <TourCreationDialog
          ref={creationRef}
          stages={s.stages}
          active={s.activeStage}
          title={creationTitle}
          dayOffset={s.dayOffset}
          dayCount={s.dayCount}
          onConfirm={(payloads) => void handleTourCreated(payloads)}
          onClose={closeOverlay}
          onSelect={(i) => (s.activeStage = i)}
          onRemove={handleRemoveStage}
          onPickPoint={handlePickPoint}
          onDrawTrack={(seed) => handleDrawTrack(seed)}
          onNextDay={handleNextDay}
          onStageChange={handleStageChange}
          onHandoverMoved={(i, p) => void handleHandoverMoved(i, p)}
        />
      </div>
    );

  return (
    <div className={c('map-page', { 'map-page--tour-locked': tourRunning || tourWelcome })}>
      {/* Portaled to <body>: the guided tour's overlay lives there, the banner stays above it. */}
      {createPortal(
        <Transition name="tour-slide" cls={tourSlideCls}>
          {tourRunning && (
            <OnboardingTourBanner
              title={onboardingTour.currentTitle}
              current={onboardingTour.currentIndex + 1}
              total={onboardingTour.totalSteps}
              canBack={onboardingTour.currentIndex > 0}
              busy={onboardingTour.isStaging}
              onBack={() => onboardingTour.back()}
              onNext={() => onboardingTour.next()}
              onFinish={() => onboardingTour.finish()}
            />
          )}
        </Transition>,
        document.body,
      )}
      {createPortal(
        <Transition name="welcome" cls={welcomeCls}>
          {tourWelcome && (
            <OnboardingWelcome
              onStart={() => onboardingTour.startFromWelcome()}
              onSkip={() => onboardingTour.skipWelcome()}
              onDismiss={() => onboardingTour.dismissWelcome()}
            />
          )}
        </Transition>,
        document.body,
      )}
      {s.showCalendarFeatureNotice &&
        createPortal(
          <DialogWindow
            title={t('calendar.featureNotice.title')}
            onClose={dismissCalendarFeatureNotice}
          >
            <div className={c('calendar-feature-notice')}>
              <p>{t('calendar.featureNotice.body')}</p>
              <BaseButton size="md" onClick={dismissCalendarFeatureNotice}>
                {t('calendar.featureNotice.cta')}
              </BaseButton>
            </div>
          </DialogWindow>,
          document.body,
        )}

      <ErrorSnackbar
        message={inboxSnackbar.snackbar.message}
        visible={inboxSnackbar.snackbar.visible}
        onDismiss={inboxSnackbar.dismiss}
      />
      <ErrorSnackbar
        message={notice.snackbar.message}
        visible={notice.snackbar.visible}
        info={s.noticeInfo}
        onDismiss={notice.dismiss}
      />

      <TourenbuddyMap
        covered={mapCovered}
        listedTourIds={mapListedTourIds}
        onTourClicked={handleTourClicked}
        onMapBackgroundClick={(tap) => void handleMapBackgroundClick(tap)}
        onMap={(map) => (s.map = map)}
      />

      <MapActionOverlay
        ref={mapOverlayRef}
        bearing={s.mapBearing}
        overlayActive={overlay !== null}
        onOpenFeedback={() => openOverlay('feedback')}
        onOpenProfile={() => openOverlay('profile')}
        onOpenContacts={() => openOverlay('contacts')}
        onOpenOfflineMap={() => openOverlay('offline-manage')}
        onOpenInbox={() => openOverlay('inbox')}
        onResetBearing={handleResetBearing}
        onDismissOverlay={closeOverlay}
        onOpenChange={(open) => (s.speedDialOpen = open)}
      />

      <TourActionBar
        visible={barState.visible && !isDrawingRegion}
        toursDisabled={barState.toursAction === 'dismiss'}
        addTourDisabled={
          barState.addTourAction === 'dismiss' || barState.addTourAction === 'disabled'
        }
        addTourTooltip={isAuthenticated ? undefined : t('map.overlay.signInToAddToursTooltip')}
        dismissMode={barState.toursAction === 'dismiss'}
        onTours={handleBarTours}
        onAddTour={handleBarAddTour}
      />

      {isPickingLocation && !isDrawingTrack && !s.planner && (
        <LocationPicker
          map={s.map}
          role={s.pendingPickType}
          actionsBottom={!isDesktop && s.isPickingForEdit ? 80 : undefined}
          onConfirm={handleLocationConfirmed}
          onCancel={handleLocationCancelled}
          onSearching={(searching) => (s.pickerSearching = searching)}
        />
      )}

      {s.planner && s.map && (
        <RoutePlanner
          key={s.plannerRun}
          follow={s.followWays}
          onFollowChange={(v) => (s.followWays = v)}
          compact={s.plannerCompact}
          onCompactChange={(v) => (s.plannerCompact = v)}
          map={s.map}
          initial={s.planner.initial}
          step={s.planner.step}
          title={plannerTitle}
          doneLabel={
            s.planner.stage < s.stages.length ? t('map.plan.done') : t('map.plan.continue')
          }
          routeHit={plannerRouteHit}
          hint={routesTappableInPick ? t('tours.picker.routeHint') : undefined}
          covered={mapCovered}
          track={s.planner.track}
          fixedLine={s.planner.fixedLine}
          tourTypes={plannerTourTypes}
          days={plannerDays}
          day={s.planner.stage}
          canAddDay={s.planner.stage >= s.stages.length - 1}
          back={s.stages.length > 0}
          onChange={(points) => (s.plannerPoints = points)}
          onLine={(line) => (s.plannerLine = line)}
          onDone={handlePlannerDone}
          onNextDay={handlePlannerNextDay}
          onSelectDay={(i, plan) => void handlePlannerSelectDay(i, plan)}
          onCancel={handlePlannerCancel}
        />
      )}

      {isDrawingTrack && s.map && (
        <TrackDrawer
          map={s.map}
          seed={s.trackSeed}
          tourTypes={previewTourTypes ?? []}
          onDone={handleTrackDrawn}
          onCancel={handleTrackCancelled}
          onLive={(live) => (s.drawingLive = s.isPickingForEdit ? null : live)}
        />
      )}

      {isDrawingRegion && (
        <OfflineRegionDraw
          map={s.map}
          onConfirm={handleRegionDrawn}
          onCancel={handleRegionDrawCancel}
        />
      )}

      {/* Read-only outline of the confirmed extent while the download sheet is open. */}
      {s.offlineBbox && overlay === 'offline-download' && (
        <OfflineRegionOutline map={s.map} bbox={s.offlineBbox} />
      )}

      {/* One sheet at a time; the leaving one goes before the next comes (out-in). */}
      <Transition name={s.sheetTransition} cls={c}>
        {sheet}
      </Transition>
    </div>
  );
}

/** For children that only need the map instance's ref shape. */
export type MapRef = RefObject<MapLibreMap | null>;
