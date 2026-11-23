import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createLogger } from '@/core/logging/logger';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BottomSheet } from '@/core/web/bottom-sheet.web';
import { classes } from '@/core/web/classes';
import { SideDrawer } from '@/core/web/side-drawer.web';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useFriendDisplayName } from '@/features/friendships/presentation/web/use-friend-display-name.web';
import {
  cssFill,
  distinctTypeColors,
  TOUR_TYPE_COLORS,
} from '@/features/tours/data/models/tour-type';
import { sumFlight } from '@/features/tours/domain/legs';
import {
  outingDisplayName,
  outingSegments,
  outingSpan,
  outingWay,
  spanDays,
} from '@/features/tours/domain/outing';
import { totalMetrics } from '@/features/tours/domain/route-metrics';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './outing-overview-sheet.module.css';
import { OutingSegmentTimeline } from './outing-segment-timeline.web';
import { RouteNumbers } from './route-numbers.web';
import { SegmentAddView } from './segment-add-view.web';
import { useRouteMetrics } from './use-route-metrics.web';

const c = classes(styles);
const log = createLogger('outing-overview-sheet');

/** The whole outing (#338, design D15): its span, its numbered segments, the owner's controls. */
export function OutingOverviewSheet({
  outingKey,
  showBack,
  onClose,
  onBack,
  onOpenSegment,
  onAddSegmentNew,
}: {
  outingKey: string;
  /** Offer a back button (opened from the tour list). */
  showBack?: boolean;
  onClose: () => void;
  onBack: () => void;
  onOpenSegment: (tourId: string) => void;
  /** Pick a new segment's goal on the map, appended after `anchorId`. */
  onAddSegmentNew: (anchorId: string) => void;
}) {
  const { t } = useTranslation('web');
  const { formatDateRange } = useFormatter();
  const isDesktop = useIsDesktop();
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const segments = outingSegments([...tours, ...friendTours], outingKey);
  const first = segments[0] ?? null;
  const isOwner = !!first && first.userId === currentUserId;
  const name = outingDisplayName(segments) ?? t('tours.infoSheet.unnamedTour');

  const [mode, setMode] = useState<'view' | 'edit' | 'add'>('view');
  useEffect(() => setMode('view'), [outingKey]);

  const spanDates = outingSpan(segments);
  const span = spanDates
    ? formatDateRange(spanDates.start, spanDates.end, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  /** "2 days · 3 segments": the days only when the outing spans more than one (D20). */
  const count = t('tours.outing.segmentCount', { count: segments.length });
  const days = spanDates ? spanDays(spanDates) : 1;
  const headline = days > 1 ? `${t('tours.outing.dayCount', { count: days })} · ${count}` : count;
  const way = outingWay(segments);
  const metrics = useRouteMetrics(segments);
  const totals = totalMetrics(segments.map((s) => metrics.get(s.id)!));
  const totalsFlight = sumFlight(segments.map((s) => ({ tour: s, ...metrics.get(s.id)! })));
  const colors = distinctTypeColors(
    segments.flatMap((s) => s.tourTypes),
    TOUR_TYPE_COLORS,
  );
  const { displayName: ownerName, isResolved: ownerResolved } = useFriendDisplayName(
    first?.isFriendTour ? first.userId : null,
  );

  // ── Owner edits ────────────────────────────────────────────────────────────
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const segmentsEl = useRef<HTMLElement>(null);

  function startEdit() {
    setDraftName(first?.outing?.name ?? '');
    setError(null);
    setMode('edit');
  }
  // A phone sheet shows the header and the name field first; editing is mostly about the stages.
  useEffect(() => {
    if (mode === 'edit' && !isDesktop)
      segmentsEl.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [mode]);

  /** Every outing edit is a few tour writes; one failure message covers them all. */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      log.error('Outing edit failed', err);
      setError(t('tours.outing.saveFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function finishEdit() {
    if (await run(() => useToursStore.getState().renameOuting(segments, draftName)))
      setMode('view');
  }

  if (!first) return null;
  const title = mode === 'add' ? t('tours.outing.addTitle') : name;
  const backVisible = mode === 'add' || !!showBack;
  const backLabel =
    !isDesktop || !backVisible
      ? undefined
      : mode === 'add'
        ? name
        : t('tours.infoSheet.backToTours');
  const handleBack = () => (mode === 'add' ? setMode('view') : onBack());
  const store = () => useToursStore.getState();

  const body =
    mode === 'add' ? (
      <SegmentAddView
        anchor={segments.at(-1)!}
        onPickNew={() => onAddSegmentNew(segments.at(-1)!.id)}
        onAdded={() => setMode('view')}
      />
    ) : (
      <div className={c('overview')}>
        <div className={c('hero')}>
          <span
            className={c('hero-badge')}
            style={colors.length > 0 ? { background: cssFill(colors) } : undefined}
          >
            <BaseIcon name="timeline" size="lg" />
          </span>
          <div className={c('hero-text')}>
            <span className={c('hero-headline')} data-testid="outing-headline">
              {headline}
            </span>
            {/* Dates and totals share a line, so the stages start higher in the browse-height sheet. */}
            {(span || totals.ascent || totals.descent || totals.distance) && (
              <span className={c('hero-meta hero-meta--wrap')}>
                {span && <span>{span}</span>}
                <RouteNumbers metrics={totals} flight={totalsFlight} />
              </span>
            )}
            {way && (
              <span className={c('hero-meta')} data-testid="outing-way">
                {way.from} → {way.to}
              </span>
            )}
            {first.isFriendTour && (
              <span className={c('hero-meta')}>
                <BaseIcon name="person" size="sm" />
                {ownerResolved && t('tours.infoSheet.createdByLabel', { name: ownerName })}
              </span>
            )}
          </div>
        </div>

        {mode === 'edit' && (
          <label className={c('name-field')}>
            <span className={c('name-label')}>{t('tours.outing.nameLabel')}</span>
            <input
              value={draftName}
              className={c('input')}
              type="text"
              maxLength={99}
              data-testid="outing-name-input"
              placeholder={t('tours.outing.namePlaceholder')}
              disabled={busy}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void finishEdit();
              }}
            />
          </label>
        )}

        {error && <p className={c('error')}>{error}</p>}

        <section ref={segmentsEl} className={c('segments')}>
          <h4 className={c('section-title')}>{t('tours.outing.segmentsHeader')}</h4>
          <OutingSegmentTimeline
            segments={segments}
            metrics={metrics}
            editing={mode === 'edit'}
            busy={busy}
            canConnect={isOwner}
            onOpen={onOpenSegment}
            onReorder={(from, to) => void run(() => store().reorderSegments(segments, from, to))}
            onRemove={(id) => void run(() => store().removeFromOuting(segments, id))}
            onConnect={(i) =>
              void run(() => store().connectSegments(segments[i - 1]!, segments[i]!))
            }
          />
        </section>
      </div>
    );

  const footer =
    isOwner && mode !== 'add' ? (
      <div className={c('actions')}>
        {mode === 'edit' ? (
          <BaseButton
            variant="primary"
            size="sm"
            disabled={busy}
            data-testid="outing-done"
            onClick={() => void finishEdit()}
          >
            <BaseIcon name="check" />
            {t('tours.outing.done')}
          </BaseButton>
        ) : (
          <>
            <BaseButton variant="secondary" size="sm" data-testid="outing-edit" onClick={startEdit}>
              <BaseIcon name="edit" />
              {t('tours.outing.edit')}
            </BaseButton>
            <BaseButton
              variant="primary"
              size="sm"
              data-testid="outing-add-segment"
              onClick={() => setMode('add')}
            >
              <BaseIcon name="add_road" />
              {t('tours.outing.addSegment')}
            </BaseButton>
          </>
        )}
      </div>
    ) : undefined;

  // Browsing: resizable over the map. Editing or adding fits the content (D23).
  return isDesktop ? (
    <SideDrawer
      title={title}
      backLabel={backLabel}
      onClose={onClose}
      onBack={handleBack}
      footer={footer}
    >
      {body}
    </SideDrawer>
  ) : (
    <BottomSheet
      title={title}
      fitContent
      resizable={mode === 'view'}
      showBack={backVisible || undefined}
      onClose={onClose}
      onBack={handleBack}
      footer={footer}
    >
      {body}
    </BottomSheet>
  );
}
