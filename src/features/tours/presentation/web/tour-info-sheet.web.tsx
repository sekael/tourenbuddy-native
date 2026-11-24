import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { newId } from '@/core/files';
import { createLogger } from '@/core/logging/logger';
import { clearOfflineWriteError } from '@/core/offline/mutate';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BottomSheet } from '@/core/web/bottom-sheet.web';
import { classes } from '@/core/web/classes';
import { FullScreenPage } from '@/core/web/full-screen-page.web';
import { SideDrawer } from '@/core/web/side-drawer.web';
import { Transition } from '@/core/web/transition.web';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { usePace } from '@/core/web/use-pace.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { ContactActionMenu } from '@/features/contacts/presentation/web/contact-action-menu.web';
import { ContactChip } from '@/features/contacts/presentation/web/contact-chip.web';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useFriendDisplayName } from '@/features/friendships/presentation/web/use-friend-display-name.web';
import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { useMapStore } from '@/features/map/presentation/web/map-store.web';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { CollisionNotice } from '@/features/tour-links/presentation/web/collision-notice.web';
import {
  LinkEditWarningDialog,
  type LinkWarningMode,
} from '@/features/tour-links/presentation/web/link-edit-warning-dialog.web';
import { LinkRequestBanner } from '@/features/tour-links/presentation/web/link-request-banner.web';
import { LinkedWithSection } from '@/features/tour-links/presentation/web/linked-with-section.web';
import type { TourType } from '@/features/tours/data/models/tour-type';
import { shareOriginal } from '@/features/tours/data/services/gpx-storage-service';
import { COLLISION_RADIUS_M, sharesActivity } from '@/features/tours/domain/collision';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { Tour, TourDraft } from '@/features/tours/domain/entities/tour';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';
import { flight, routeOrder, type TourLegs } from '@/features/tours/domain/legs';
import { outingKey, outingSegments } from '@/features/tours/domain/outing';
import { tourMinutes } from '@/features/tours/domain/route-metrics';
import {
  buildSuggestionItems,
  pendingGoalFrom,
  seedDraftFromPending,
} from '@/features/tours/domain/suggestion-diff';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import { OutingNavigator } from './outing-navigator.web';
import { RouteNumbers } from './route-numbers.web';
import { SegmentAddView } from './segment-add-view.web';
import { TourAttachmentViewer } from './tour-attachment-viewer.web';
import { TourAttachmentsStrip } from './tour-attachments-strip.web';
import { TourFactRows } from './tour-fact-rows.web';
import { TourForm, type TourFormHandle, type TourFormOutput } from './tour-form.web';
import styles from './tour-info-sheet.module.css';
import { TourSuggestionHistorySheet } from './tour-suggestion-history-sheet.web';
import { TourSuggestionReviewSheet } from './tour-suggestion-review-sheet.web';
import { TourTypeBadge } from './tour-type-badge.web';
import { useRouteMetrics } from './use-route-metrics.web';
import type { PointPick } from './use-swisstopo-fill.web';

const c = classes(styles);
const log = createLogger('tour-info-sheet');
type Point = { lng: number; lat: number };
type Mode = 'view' | 'edit' | 'suggest' | 'review' | 'history';
const initialOf = (name: string) => name.trim().charAt(0).toUpperCase();

/**
 * The PWA's tour detail (`tour-info-sheet.vue`): a bottom sheet on phones, the side drawer on
 * desktop. View mode shows the hero, toggles, facts, partners, attachments and suggestion entries;
 * edit and suggest mount the tour form (a full-screen page on phones); review and history show the
 * suggestion sheets in place.
 */
export function TourInfoSheet({
  tour,
  editPickedPoint,
  showBack,
  backText,
  activePickType,
  editDrawnTrack,
  onClose,
  onBack,
  onPickPoint,
  onDrawTrack,
  onTrackChange,
  onPointConsumed,
  onEditModeChange,
  onEditContact,
  onTourTypesChange,
  onStartPointChange,
  onEndPointChange,
  onOpenOuting,
  onAddSegment,
  onSplitDays,
}: {
  tour: Tour;
  /** Set by map-page after a location pick triggered from this sheet. Reset via `onPointConsumed`. */
  editPickedPoint?: PointPick | null;
  /** Show a back button (to the tours list, or the outing). */
  showBack?: boolean;
  /** Desktop back label when the back leads elsewhere than the tour list (e.g. the outing). */
  backText?: string;
  /** Which pick type is active: drives the collapsed header label in edit mode. */
  activePickType?: 'goal' | 'start' | 'end' | null;
  /** Set by map-page after a track drawing started from this sheet. Reset via `onPointConsumed`. */
  editDrawnTrack?: DrawnTrack | null;
  onClose: () => void;
  onBack: () => void;
  onPickPoint: (type: 'start' | 'end' | 'goal') => void;
  onDrawTrack: (seed: DrawnTrack | null) => void;
  onTrackChange: (line: LngLat[] | null) => void;
  onPointConsumed: () => void;
  /** The sheet enters (true) or exits (false) edit mode. */
  onEditModeChange: (editing: boolean) => void;
  /** The user asks to edit a contact from the action menu. */
  onEditContact: (contactId: string) => void;
  onTourTypesChange: (tourTypes: TourType[], legs: TourLegs | null) => void;
  onStartPointChange: (point: Point | null) => void;
  onEndPointChange: (point: Point | null) => void;
  /** Open an outing's overview (#338). */
  onOpenOuting: (outingKey: string) => void;
  /** Pick a new segment's goal on the map, after this tour's outing (#338). */
  onAddSegment: (anchorId: string) => void;
  /** Keep this multi-day tour's first day and lay out the next days (D5). */
  onSplitDays: (anchorId: string) => void;
}) {
  'use no memo';
  const { t, i18n } = useTranslation('web');
  const { formatElevation } = useFormatter();
  const pace = usePace();
  const isDesktop = useIsDesktop();
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const contacts = useContactsStore((s) => s.contacts);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const isPicking = useMapStore((s) => s.isPickingLocation);
  const isDrawingTrack = useMapStore((s) => s.isDrawingTrack);
  const siblingsByTourId = useTourLinksStore((s) => s.siblingsByTourId);
  const requestsByTourId = useTourLinksStore((s) => s.requestsByTourId);
  const groupIdByTourId = useTourLinksStore((s) => s.groupIdByTourId);
  const userIdToPhoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const pendingSuggestionCount = useTourSuggestionsStore((s) => s.pendingCountByTour[tour.id] ?? 0);
  useTourSuggestionsStore((s) => s.suggestions);
  /** Author-side: the viewer's own unresolved proposal on this friend tour. */
  const myPendingSuggestions = useTourSuggestionsStore.getState().myPendingFor(tour.id);

  const isOwner = !!currentUserId && currentUserId === tour.userId;

  /** A span of days, standalone or last in its outing: its days can follow as stages (D5). */
  const canSplit = (() => {
    const { plannedDate, endDate } = tour;
    if (
      !isOwner ||
      !plannedDate ||
      !endDate ||
      endDate.getTime() - plannedDate.getTime() < 43_200_000
    )
      return false;
    const segments = outingSegments(tours, outingKey(tour));
    return segments.length === 0 || segments.at(-1)?.id === tour.id;
  })();

  // ── View/edit mode ─────────────────────────────────────────────────────────
  // `suggest` composes a proposal on a friend's tour; `review` adjudicates (owner) or shows your own
  // pending proposal (author); `history` is the retained record.
  const [mode, setMode] = useState<Mode>('view');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  /** Ids of attachments that existed when edit mode was entered: cancel rolls back the rest. */
  const editBaseAttachmentIds = useRef(new Set<string>());
  // Pending goal during edit, and the latest pick for the form (it looks up name + elevation).
  const [pendingGoal, setPendingGoal] = useState<Point>({ ...tour.goal });
  const [pendingPick, setPendingPick] = useState<PointPick | null>(null);
  const [pendingTrack, setPendingTrack] = useState<DrawnTrack | null>(null);
  const editForm = useRef<TourFormHandle>(null);
  const [formBlocked, setFormBlocked] = useState(false);

  function enterEditMode() {
    // A prior offline-write error never resurfaces on the next edit.
    clearOfflineWriteError();
    setPendingGoal({ ...tour.goal });
    setPendingPick(null);
    setPendingTrack(null);
    editBaseAttachmentIds.current = new Set(
      (useTourAttachmentsStore.getState().attachmentsByTour[tour.id] ?? []).map((a) => a.id),
    );
    setMode('edit');
    onEditModeChange(true);
  }

  async function cancelEdit() {
    // Remove any attachments added during this edit session.
    const store = useTourAttachmentsStore.getState();
    const current = store.attachmentsByTour[tour.id] ?? [];
    for (const att of current.filter((a) => !editBaseAttachmentIds.current.has(a.id)))
      await store.remove(att);
    clearOfflineWriteError();
    setMode('view');
    onEditModeChange(false);
  }

  // Dismissed while editing: the parent cleans up the preview marker.
  const editModeChange = useRef(onEditModeChange);
  editModeChange.current = onEditModeChange;
  useEffect(
    () => () => {
      if (modeRef.current === 'edit') editModeChange.current(false);
    },
    [],
  );

  // Reactive handoff from map-page after a location pick or a drawing in edit mode.
  useEffect(() => {
    if (!editPickedPoint) return;
    if (editPickedPoint.type === 'goal') setPendingGoal(editPickedPoint.location);
    setPendingPick(editPickedPoint);
    onPointConsumed();
  }, [editPickedPoint]);
  useEffect(() => {
    if (!editDrawnTrack) return;
    setPendingTrack(editDrawnTrack);
    onPointConsumed();
  }, [editDrawnTrack]);

  // ── Tour link group / pending requests ─────────────────────────────────────
  const linkSiblings = siblingsByTourId.get(tour.id) ?? [];
  const linkPendingRequests = requestsByTourId.get(tour.id) ?? [];
  const isLinked = groupIdByTourId.has(tour.id);

  // Edit-warning dialog: an edit that would evict the tour from its group or invalidate a pending
  // link request asks first. Confirm proceeds; cancel rolls back.
  const [editWarning, setEditWarning] = useState<{
    run: () => Promise<unknown>;
    mode: LinkWarningMode;
    pendingCount: number;
  } | null>(null);

  // The full "Linked with" list and "Add segment" take over the sheet body; back returns.
  const [linksView, setLinksView] = useState(false);
  const [addSegmentView, setAddSegmentView] = useState(false);
  useEffect(() => {
    setLinksView(false);
    setAddSegmentView(false);
  }, [tour.id]);

  function navigateToSibling(siblingId: string) {
    setLinksView(false);
    useMapStore.getState().selectTour(siblingId);
  }

  // Shared by the edit save and the suggestion submit.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, setIsSaving] = useState(false);

  // ── Suggestions ────────────────────────────────────────────────────────────
  /** Only a marked partner on a friend's tour may suggest: the same gate as detail read. */
  const canSuggest = tour.isFriendTour && tour.isPartner === true;
  const [suggestBatchId, setSuggestBatchId] = useState<string | null>(null);
  const [suggestSeedDraft, setSuggestSeedDraft] = useState<TourDraft | null>(null);

  /**
   * Enter suggest mode. Revising (D12) reopens the form seeded with the author's OWN pending values
   * and reuses the SAME batch id, so one reconciling call updates the batch in place.
   */
  function enterSuggestMode(batchId?: string) {
    clearOfflineWriteError();
    const pending = batchId ? myPendingSuggestions.filter((s) => s.batchId === batchId) : [];
    setSuggestBatchId(batchId ?? newId());
    const seed = seedDraftFromPending(tour, pending);
    const goal = pendingGoalFrom(pending);
    // A proposed goal carries its elevation; it seeds the field when the tour has none.
    setSuggestSeedDraft({ ...seed, elevation: seed.elevation ?? goal?.elevation ?? null });
    setPendingGoal(goal ? { lng: goal.lng, lat: goal.lat } : { ...tour.goal });
    setPendingPick(null);
    setPendingTrack(null);
    // The partner needs the owner's attachments loaded to propose a removal against them.
    void useTourAttachmentsStore.getState().load(tour.id);
    setMode('suggest');
    onEditModeChange(true);
  }

  function cancelSuggest() {
    setSuggestBatchId(null);
    setSuggestSeedDraft(null);
    setMode('view');
    onEditModeChange(false);
  }

  /** The submitted draft as one batch: the binary ops are appended here (only the host uploads, D9). */
  async function handleSuggestSubmit({ draft, draftId, proposedRemovals }: TourFormOutput) {
    if (useMapStore.getState().isPickingLocation) return;
    const batchId = suggestBatchId;
    if (!batchId) return;
    const suggestions = useTourSuggestionsStore.getState();
    const attachments = useTourAttachmentsStore.getState();
    setSaveError(null);
    setIsSaving(true);
    try {
      // Upload first: a staged file has no `storagePath` until it lands in the suggester's prefix.
      const addedAttachments = [];
      for (const file of attachments.stagedByDraft[draftId] ?? []) {
        addedAttachments.push({
          // A distinct target per add, or the pending-row unique index keeps only the last.
          id: newId(),
          storagePath: await suggestions.uploadStaged('tour-attachments', tour.id, file),
          mimeType: file.type,
          sizeBytes: file.size,
          originalFilename: file.name,
        });
      }
      const items = buildSuggestionItems(tour, draft, pendingGoal, {
        addedAttachments,
        removedAttachmentIds: proposedRemovals,
      });
      await suggestions.submitBatch(tour.id, batchId, items);
      const error = useTourSuggestionsStore.getState().error;
      if (error) {
        setSaveError(error);
        return;
      }
      attachments.clearStaged(draftId);
      cancelSuggest();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('tours.infoSheet.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  // ── Edit save ──────────────────────────────────────────────────────────────
  function findTour(id: string) {
    return tours.find((x) => x.id === id) ?? friendTours.find((x) => x.id === id);
  }

  /** True if applying the edit to a linked tour would break the group invariant. */
  function wouldEvict(draft: TourDraft, newGoal: Point): boolean {
    const effectiveVisibility = draft.visibility ?? tour.visibility;
    if (tour.visibility === 'friends' && effectiveVisibility !== 'friends') return true;
    // Mirrors the server: evicted iff no activity in common with, or outside the radius of, ANY sibling.
    const retyped = draft.tourTypes.join() !== tour.tourTypes.join();
    const moved = newGoal.lng !== tour.goal.lng || newGoal.lat !== tour.goal.lat;
    if (!retyped && !moved) return false;
    for (const sibId of linkSiblings) {
      const sib = findTour(sibId);
      if (!sib) continue; // out of scope (RLS, friendship gap): be conservative, skip
      if (retyped && !sharesActivity(draft.tourTypes, sib.tourTypes)) return true;
      if (moved && !isSameGoal(newGoal, sib.goal, COLLISION_RADIUS_M)) return true;
    }
    return false;
  }

  /** Pending requests that would lose the collision predicate, by direction (fn_collision_predicate). */
  function pendingRequestsBrokenBy(draft: TourDraft, newGoal: Point) {
    const result = { outgoing: 0, incoming: 0 };
    const effectiveVisibility = draft.visibility ?? tour.visibility;
    for (const req of linkPendingRequests) {
      const isOutgoing = req.initiatorTourId === tour.id;
      const other = findTour(isOutgoing ? req.targetTourId : req.initiatorTourId);
      const broken =
        effectiveVisibility !== 'friends' ||
        // Counterpart out of scope (RLS): assume the predicate still holds.
        (!!other &&
          (!sharesActivity(draft.tourTypes, other.tourTypes) ||
            other.visibility !== 'friends' ||
            !isSameGoal(newGoal, other.goal, COLLISION_RADIUS_M)));
      if (broken) result[isOutgoing ? 'outgoing' : 'incoming']++;
    }
    return result;
  }

  /** Combined gate: eviction wins ('linked'); else pending-request invalidation. */
  function wouldBreakLink(
    draft: TourDraft,
    newGoal: Point,
  ): { mode: LinkWarningMode; pendingCount: number } | null {
    if (isLinked && wouldEvict(draft, newGoal)) return { mode: 'linked', pendingCount: 0 };
    const broken = pendingRequestsBrokenBy(draft, newGoal);
    const total = broken.outgoing + broken.incoming;
    if (total === 0) return null;
    if (broken.outgoing > 0 && broken.incoming > 0)
      return { mode: 'pending-mixed', pendingCount: total };
    if (broken.outgoing > 0) return { mode: 'pending-outgoing', pendingCount: broken.outgoing };
    return { mode: 'pending-incoming', pendingCount: broken.incoming };
  }

  async function handleEditSubmit({ draft, gpxRemoved }: TourFormOutput) {
    if (useMapStore.getState().isPickingLocation) {
      log.debug('Ignoring edit submit while location picker is active');
      return;
    }
    const breakage = wouldBreakLink(draft, pendingGoal);
    if (breakage) {
      setEditWarning({ ...breakage, run: () => performEditSubmit(draft, gpxRemoved) });
      return;
    }
    await performEditSubmit(draft, gpxRemoved);
  }

  async function performEditSubmit(draft: TourDraft, gpxRemoved: boolean) {
    setSaveError(null);
    setIsSaving(true);
    try {
      await useToursStore.getState().updateTour(tour.id, draft, pendingGoal, gpxRemoved);
      setMode('view');
      onEditModeChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('tours.infoSheet.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmEditWarning() {
    const run = editWarning?.run;
    setEditWarning(null);
    if (run) await run();
  }

  async function handleDownloadGpx() {
    if (!tour.gpxFilepath) return;
    try {
      await shareOriginal(tour.gpxFilepath, `${tour.name ?? 'track'}.gpx`);
    } catch (err) {
      log.error('GPX download failed', err);
    }
  }

  // ── Toggles ────────────────────────────────────────────────────────────────
  const toggleCompleted = () =>
    void useToursStore.getState().setCompleted(tour.id, !tour.completed);

  async function toggleVisibility() {
    const next = tour.visibility === 'private' ? 'friends' : 'private';
    const makePrivate = () => useToursStore.getState().setVisibility(tour.id, 'private');
    // friends → private evicts from a group (server trigger) or invalidates pending requests: warn.
    if (next === 'private') {
      if (isLinked) {
        setEditWarning({ mode: 'linked', pendingCount: 0, run: makePrivate });
        return;
      }
      if (linkPendingRequests.length > 0) {
        const outgoing = linkPendingRequests.filter((r) => r.initiatorTourId === tour.id).length;
        const incoming = linkPendingRequests.length - outgoing;
        setEditWarning({
          mode:
            outgoing > 0 && incoming > 0
              ? 'pending-mixed'
              : outgoing > 0
                ? 'pending-outgoing'
                : 'pending-incoming',
          pendingCount: linkPendingRequests.length,
          run: makePrivate,
        });
        return;
      }
    }
    await useToursStore.getState().setVisibility(tour.id, next);
  }

  // ── Attachment viewer ──────────────────────────────────────────────────────
  const [viewer, setViewer] = useState<{
    attachments: TourAttachment[];
    startIndex: number;
  } | null>(null);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [deleteState, setDeleteState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function confirmDelete() {
    setDeleteError(null);
    setDeleteState('loading');
    try {
      // Online it deletes; offline it queues and removes the tour optimistically: close either way.
      await useToursStore.getState().deleteTour(tour.id);
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('tours.infoSheet.deleteFailed'));
      setDeleteState('idle');
    }
  }

  // ── Read-only values ───────────────────────────────────────────────────────
  const displayName = tour.name ?? t('tours.infoSheet.unnamedTour');
  // Picking while editing collapses the surface to its header, so the map and crosshair stay visible.
  const sheetCollapsed = isPicking && (mode === 'edit' || mode === 'suggest');
  // On phones an edit takes a full-screen page; a pick collapses it in place (no remount, #337).
  const editAsPage = !isDesktop && (mode === 'edit' || mode === 'suggest');

  function handleSheetClose() {
    // In page mode the top-bar cancel returns to view mode through the form's cleanup.
    if (editAsPage) editForm.current?.cancel();
    else onClose();
  }

  const sheetTitle = (() => {
    if (sheetCollapsed) {
      if (isDrawingTrack) return t('map.draw.title');
      if (activePickType === 'start') return t('tours.picker.startTitle');
      if (activePickType === 'end') return t('tours.picker.endTitle');
      return t('tours.picker.goalTitle');
    }
    if (linksView) return t('tourLinks.linkedWithHeader');
    if (addSegmentView) return t('tours.outing.addTitle');
    if (mode === 'suggest') return `${t('tours.suggestions.suggestTitlePrefix')}: ${displayName}`;
    if (mode === 'review') return t('tours.suggestions.reviewTitle');
    if (mode === 'history') return t('tours.suggestions.historyTitle');
    return mode === 'edit'
      ? `${t('tours.infoSheet.editTitlePrefix')}: ${displayName}`
      : displayName;
  })();

  // linksView / addSegmentView / review / history win on both viewports: back returns to the details.
  const sheetShowBack =
    linksView || addSegmentView || mode === 'review' || mode === 'history'
      ? true
      : showBack && !isDesktop
        ? true
        : undefined;
  const sheetBackLabel = (() => {
    if (linksView && isDesktop) return t('tourLinks.linkedWithHeader');
    if (addSegmentView && isDesktop) return displayName;
    // The desktop drawer renders its back button only with a label.
    if ((mode === 'review' || mode === 'history') && isDesktop) return displayName;
    return showBack && isDesktop ? (backText ?? t('tours.infoSheet.backToTours')) : undefined;
  })();

  function handleSheetBack() {
    if (linksView) setLinksView(false);
    else if (addSegmentView) setAddSegmentView(false);
    // Review/history are in-sheet views, not routes.
    else if (mode === 'review' || mode === 'history') setMode('view');
    else onBack();
  }

  const formattedDate = (() => {
    const start = tour.plannedDate;
    if (!start) return null;
    // Abbreviated month: a cross-month span still fits the hero's second line on a phone.
    const fmt = new Intl.DateTimeFormat(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const day = tour.endDate ? fmt.formatRange(start, tour.endDate) : fmt.format(start);
    return tour.startTime ? `${day} · ${tour.startTime}` : day;
  })();

  const partners = contacts.filter((x) => tour.partnerIds.includes(x.id));
  // Friend tours name their owner by the viewer's OWN contact for them, rendered once final.
  const { displayName: ownerName, isResolved: ownerResolved } = useFriendDisplayName(
    tour.isFriendTour ? tour.userId : null,
  );
  // A friend tour's partners: contact name first, else the server-resolved profile name; read-only.
  const friendPartnerNames = tour.isFriendTour
    ? (tour.partnerNames ?? [])
        .map((p) => {
          if (p.userId === currentUserId) return t('tours.infoSheet.partnerSelf');
          const contactName = resolveFriendName(p.userId, userIdToPhoneMap, (phone) =>
            useContactsStore.getState().findContactByMethodValue('phone', phone),
          );
          return contactName ?? [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
        })
        .filter(Boolean)
    : [];
  // Warm the phone map for the partner list in ONE batched lookup.
  const partnerIdsKey = (tour.partnerNames ?? []).map((p) => p.userId).join();
  useEffect(() => {
    if (partnerIdsKey) void useFriendshipsStore.getState().ensurePhones(partnerIdsKey.split(','));
  }, [partnerIdsKey]);
  /** Partner contacts resolving to no user: one generic "and X more" pill (partner viewers only). */
  const unresolvedPartnerCount = tour.isFriendTour ? (tour.unresolvedPartnerCount ?? 0) : 0;

  // ── Contact action menu ────────────────────────────────────────────────────
  const [menu, setMenu] = useState<{ contactId: string; rect: DOMRect } | null>(null);
  const menuContact = menu ? (partners.find((x) => x.id === menu.contactId) ?? null) : null;
  function handleEditContact(contactId: string) {
    setMenu(null);
    if (!isDesktop) onClose();
    onEditContact(contactId);
  }

  const coordinates = `${tour.goal.lat.toFixed(4)}°N, ${tour.goal.lng.toFixed(4)}°E`;
  // Climb · descent (or flight) · distance beside the date, as the outing hero has them.
  const metrics = useRouteMetrics([tour]).get(tour.id)!;
  /** The time the drawing showed: the track at the user's pace. */
  const minutes = tourMinutes(metrics, tour, pace);
  const formattedElevation = tour.elevation == null ? null : formatElevation(tour.elevation);

  // ── Body ───────────────────────────────────────────────────────────────────
  const formProps = {
    embedded: editAsPage,
    allowGoalEdit: true,
    currentGoal: pendingGoal,
    tourId: tour.id,
    pick: pendingPick,
    drawnTrack: pendingTrack,
    disabled: isPicking,
    onPublic: (p: { submitBlocked: boolean }) => setFormBlocked(p.submitBlocked),
    onPickPoint,
    onDrawTrack,
    onTrackChange,
    onTourTypesChange,
    onStartPointChange,
    onEndPointChange,
  };

  let body: ReactNode;
  if (mode === 'edit')
    body = (
      <>
        {saveError && <p className={c('save-error')}>{saveError}</p>}
        <TourForm
          {...formProps}
          ref={editForm}
          formId="tour-edit-form"
          submitLabel={t('tours.infoSheet.saveLabel')}
          initialDraft={tour}
          onSubmit={(out) => void handleEditSubmit(out)}
          onCancel={() => void cancelEdit()}
        />
      </>
    );
  else if (mode === 'suggest')
    body = (
      <>
        {saveError && <p className={c('save-error')}>{saveError}</p>}
        <TourForm
          {...formProps}
          ref={editForm}
          formId="tour-suggest-form"
          mode="suggest"
          submitLabel={t('tours.suggestions.submitBtn')}
          initialDraft={suggestSeedDraft}
          onSubmit={(out) => void handleSuggestSubmit(out)}
          onCancel={cancelSuggest}
        />
      </>
    );
  else if (mode === 'review')
    body = (
      <TourSuggestionReviewSheet
        tour={tour}
        mode={isOwner ? 'owner' : 'author'}
        onRevise={(batchId) => enterSuggestMode(batchId)}
      />
    );
  else if (mode === 'history')
    body = <TourSuggestionHistorySheet tour={tour} mode={isOwner ? 'owner' : 'author'} />;
  else if (addSegmentView)
    body = (
      <SegmentAddView
        anchor={tour}
        onPickNew={() => onAddSegment(tour.id)}
        onAdded={(key) => onOpenOuting(key)}
      />
    );
  else if (linksView)
    body = <LinkedWithSection siblings={linkSiblings} fullList onOpenTour={navigateToSibling} />;
  else
    body = (
      <div className={c('details')}>
        {/* Segment of an outing: where it sits, the overview and its neighbours (#338). */}
        <OutingNavigator tour={tour} onOpenOuting={onOpenOuting} />

        {/* Tour link group siblings + pending link requests + collision notice */}
        <LinkedWithSection
          siblings={linkSiblings}
          onOpenTour={navigateToSibling}
          onViewAll={() => setLinksView(true)}
        />
        {linkPendingRequests.map((req) => (
          <LinkRequestBanner key={req.id} request={req} />
        ))}
        {isOwner && <CollisionNotice ownTourId={tour.id} />}

        {/* Hero: led by the goal. Line 1 elevation (or date); line 2 date · coordinates. */}
        <div className={c('hero', { 'hero--sheet': !isDesktop })}>
          <TourTypeBadge types={routeOrder(tour)} className={c('hero-badge')}>
            {/* State stamps on the badge: they pop in when the owner flips a toggle. */}
            <Transition name="stamp" cls={c}>
              {tour.completed && (
                <span key="done" className={c('hero-stamp hero-stamp--done')} aria-hidden="true">
                  <BaseIcon name="check" size="sm" />
                </span>
              )}
            </Transition>
            <Transition name="stamp" cls={c}>
              {tour.visibility === 'private' && (
                <span
                  key="private"
                  className={c('hero-stamp hero-stamp--private')}
                  aria-hidden="true"
                >
                  <BaseIcon name="lock" size="sm" />
                </span>
              )}
            </Transition>
          </TourTypeBadge>
          <div className={c('hero-text')}>
            {(formattedElevation || formattedDate) && (
              <div className={c('hero-line')}>
                {formattedElevation ? (
                  <span className={c('hero-headline')}>
                    <BaseIcon name="landscape" size="sm" className={c('hero-headline-icon')} />
                    <span className="visually-hidden">
                      {t('tours.infoSheet.iconTooltipElevation')}
                    </span>
                    {formattedElevation}
                  </span>
                ) : (
                  <span className={c('hero-headline hero-headline--date')}>{formattedDate}</span>
                )}
              </div>
            )}
            {/* Separate items: a wrap leaves no dangling separator. */}
            <span className={c('hero-meta')}>
              {formattedElevation && formattedDate && <span>{formattedDate}</span>}
              <RouteNumbers
                metrics={metrics}
                flight={flight(tour)}
                minutes={minutes}
                data-testid="hero-route"
              />
              <span className={c('coords')}>{coordinates}</span>
            </span>
            {tour.isFriendTour && (
              <span className={c('hero-meta')}>
                <BaseIcon name="person" size="sm" />
                {ownerResolved ? (
                  t('tours.infoSheet.createdByLabel', { name: ownerName })
                ) : (
                  <span className={c('owner-skeleton')} aria-hidden="true" />
                )}
              </span>
            )}
            {/* The owner reads the state off the toggle; friends get it spelled out. */}
            {!isOwner && tour.completed && (
              <span className={c('status-pill')}>
                <BaseIcon name="check_circle" size="sm" />
                {t('tours.infoSheet.completedBtn')}
              </span>
            )}
          </div>
        </div>

        {/* Owner toggles: completion + visibility */}
        {isOwner && (
          <div className={c('owner-toggles')}>
            <button
              type="button"
              className={c('completion-toggle action-btn', {
                'completion-toggle--done': !!tour.completed,
              })}
              aria-pressed={!!tour.completed}
              onClick={toggleCompleted}
            >
              <BaseIcon name={tour.completed ? 'check_circle' : 'radio_button_unchecked'} />
              <span
                className={c('toggle-label')}
                data-alt={t(
                  tour.completed
                    ? 'tours.infoSheet.completeTourBtn'
                    : 'tours.infoSheet.completedBtn',
                )}
              >
                {t(
                  tour.completed
                    ? 'tours.infoSheet.completedBtn'
                    : 'tours.infoSheet.completeTourBtn',
                )}
              </span>
            </button>
            <button
              type="button"
              className={c('visibility-toggle action-btn', {
                'visibility-toggle--private': tour.visibility === 'private',
              })}
              aria-pressed={tour.visibility === 'private'}
              onClick={() => void toggleVisibility()}
            >
              <BaseIcon name={tour.visibility === 'private' ? 'lock' : 'group'} />
              <span
                className={c('toggle-label')}
                data-alt={t(
                  tour.visibility === 'private'
                    ? 'tours.infoSheet.visibilityMakePrivate'
                    : 'tours.infoSheet.visibilityMakeFriends',
                )}
              >
                {t(
                  tour.visibility === 'private'
                    ? 'tours.infoSheet.visibilityMakeFriends'
                    : 'tours.infoSheet.visibilityMakePrivate',
                )}
              </span>
            </button>
          </div>
        )}

        <TourFactRows
          tour={tour}
          route={
            tour.gpxFilepath ? (
              <BaseButton
                variant="secondary"
                size="sm"
                className={c('gpx-download-btn')}
                onClick={() => void handleDownloadGpx()}
              >
                <BaseIcon name="route" />
                {t('tours.infoSheet.downloadGpxBtn')}
              </BaseButton>
            ) : undefined
          }
          partners={
            partners.length > 0 ||
            (tour.isFriendTour && (friendPartnerNames.length > 0 || unresolvedPartnerCount > 0)) ? (
              // Own tour: contact chips with the action menu; friend's tour: read-only names.
              <div className={c('partner-chips')}>
                {partners.length > 0 ? (
                  partners.map((partner) => (
                    <ContactChip
                      key={partner.id}
                      contact={partner}
                      selected={false}
                      mode="action"
                      className={c('partner-pill')}
                      data-initial={initialOf(resolveContactName(partner))}
                      onOpen={(contactId, rect) => setMenu({ contactId, rect })}
                    />
                  ))
                ) : (
                  <>
                    {friendPartnerNames.map((name, i) => (
                      <span
                        key={i}
                        className={c('friend-partner-chip partner-pill')}
                        data-initial={initialOf(name)}
                      >
                        {name}
                      </span>
                    ))}
                    {unresolvedPartnerCount > 0 && (
                      <span className={c('friend-partner-chip friend-partner-chip--more')}>
                        {t('tours.infoSheet.morePartners', { count: unresolvedPartnerCount })}
                      </span>
                    )}
                  </>
                )}
              </div>
            ) : undefined
          }
        />

        <TourAttachmentsStrip
          tourId={tour.id}
          className={c('group')}
          onOpenViewer={(attachments, startIndex) => setViewer({ attachments, startIndex })}
        />

        {/* Suggestions at the BOTTOM: actions on the tour, not facts about it (D15). */}
        {(isOwner || canSuggest) && (
          <div className={c('suggestion-actions group')}>
            {isOwner && pendingSuggestionCount > 0 && (
              <button
                type="button"
                className={c('action-btn suggestion-entry')}
                data-testid="review-suggestions-btn"
                onClick={() => setMode('review')}
              >
                <BaseIcon name="feedback" />
                {t('tours.suggestions.pendingCount', { count: pendingSuggestionCount })}
              </button>
            )}
            {canSuggest && myPendingSuggestions.length > 0 && (
              <button
                type="button"
                className={c('action-btn suggestion-entry')}
                data-testid="my-suggestions-btn"
                onClick={() => setMode('review')}
              >
                <BaseIcon name="feedback" />
                {t('tours.suggestions.yourPendingCount', { count: myPendingSuggestions.length })}
              </button>
            )}
            {/* One pending proposal per suggester: while theirs is open, the way in is "revise" (D12). */}
            {canSuggest && myPendingSuggestions.length === 0 && (
              <button
                type="button"
                className={c('action-btn suggestion-entry')}
                data-testid="suggest-btn"
                onClick={() => enterSuggestMode()}
              >
                <BaseIcon name="edit" />
                {t('tours.suggestions.suggestBtn')}
              </button>
            )}
            <button
              type="button"
              className={c('action-btn suggestion-entry')}
              data-testid="suggestion-history-btn"
              onClick={() => setMode('history')}
            >
              <BaseIcon name="schedule" />
              {t('tours.suggestions.historyBtn')}
            </button>
          </div>
        )}

        {menuContact && (
          <ContactActionMenu
            contact={menuContact}
            anchorRect={menu?.rect ?? null}
            onClose={() => setMenu(null)}
            onEditContact={handleEditContact}
          />
        )}
      </div>
    );

  const footer =
    mode === 'view' && isOwner && !linksView && !addSegmentView ? (
      <div className={c('view-actions')}>
        {/* A row of its own, full width like the toggles above: three labels never fit one row. */}
        {deleteState === 'idle' && canSplit && (
          <BaseButton
            variant="secondary"
            size="sm"
            className={c('split-btn')}
            data-testid="split-days-btn"
            onClick={() => onSplitDays(tour.id)}
          >
            <BaseIcon name="calendar_view_day" />
            {t('tours.form.splitDaysBtn')}
          </BaseButton>
        )}
        <div className={c('edit-delete-row')}>
          {deleteState === 'idle' && !canSplit && (
            <BaseButton
              variant="secondary"
              size="sm"
              data-testid="add-segment-btn"
              onClick={() => setAddSegmentView(true)}
            >
              <BaseIcon name="add_road" />
              {t('tours.outing.addSegment')}
            </BaseButton>
          )}
          {deleteState === 'idle' && (
            <BaseButton
              variant="secondary"
              size="sm"
              data-testid="edit-btn"
              onClick={enterEditMode}
            >
              <BaseIcon name="edit" />
              {t('tours.infoSheet.editBtn')}
            </BaseButton>
          )}
          {deleteState === 'confirm' ? (
            <>
              <span className={c('delete-confirm-text')}>
                {t('tours.infoSheet.deleteConfirmText')}
              </span>
              {isLinked && linkSiblings.length > 0 && (
                <span className={c('delete-confirm-text delete-confirm-text--link')}>
                  {t('tourLinks.deleteUnlinkWarning', { count: linkSiblings.length })}
                </span>
              )}
              <div className={c('delete-confirm-row')}>
                <BaseButton
                  variant="secondary"
                  size="sm"
                  data-testid="delete-cancel-btn"
                  onClick={() => setDeleteState('idle')}
                >
                  {t('tours.infoSheet.cancelBtn')}
                </BaseButton>
                <BaseButton
                  variant="danger"
                  size="sm"
                  data-testid="delete-confirm-btn"
                  onClick={() => void confirmDelete()}
                >
                  {t('tours.infoSheet.deleteBtn')}
                </BaseButton>
              </div>
            </>
          ) : (
            <BaseButton
              variant="danger-outline"
              size="sm"
              data-testid="delete-btn"
              disabled={deleteState === 'loading'}
              onClick={() => setDeleteState('confirm')}
            >
              <BaseIcon name="delete" />
              {deleteState === 'loading'
                ? t('tours.infoSheet.deletingBtn')
                : t('tours.infoSheet.deleteBtn')}
            </BaseButton>
          )}
        </div>
        {deleteError && <p className={c('delete-error')}>{deleteError}</p>}
      </div>
    ) : undefined;

  const extras = (
    <>
      {viewer && (
        <TourAttachmentViewer
          attachments={viewer.attachments}
          startIndex={viewer.startIndex}
          onClose={() => setViewer(null)}
        />
      )}
      {editWarning && (
        <LinkEditWarningDialog
          linkedCount={linkSiblings.length}
          pendingCount={editWarning.pendingCount}
          mode={editWarning.mode}
          onConfirm={() => void confirmEditWarning()}
          onCancel={() => setEditWarning(null)}
        />
      )}
    </>
  );

  // Full-screen edit/suggest page: the submit lives in the top app bar (above the keyboard).
  if (editAsPage)
    return (
      <FullScreenPage
        title={sheetTitle}
        collapsed={sheetCollapsed}
        showBack={false}
        onClose={handleSheetClose}
        onBack={handleSheetBack}
        pageAction={
          <BaseButton
            type="submit"
            form={mode === 'edit' ? 'tour-edit-form' : 'tour-suggest-form'}
            variant="primary"
            size="sm"
            disabled={formBlocked}
          >
            {mode === 'edit' ? t('tours.infoSheet.saveLabel') : t('tours.suggestions.submitBtn')}
          </BaseButton>
        }
      >
        {body}
        {extras}
      </FullScreenPage>
    );
  if (isDesktop)
    return (
      <SideDrawer
        title={sheetTitle}
        collapsed={sheetCollapsed}
        backLabel={sheetBackLabel}
        onClose={handleSheetClose}
        onBack={handleSheetBack}
        footer={footer}
      >
        {body}
        {extras}
      </SideDrawer>
    );
  return (
    <BottomSheet
      title={sheetTitle}
      fitContent
      resizable
      collapsed={sheetCollapsed}
      showBack={sheetShowBack}
      onClose={handleSheetClose}
      onBack={handleSheetBack}
      footer={footer}
    >
      {body}
      {extras}
    </BottomSheet>
  );
}
