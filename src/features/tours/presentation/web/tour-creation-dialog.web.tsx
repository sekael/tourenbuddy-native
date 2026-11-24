import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { FullScreenPage } from '@/core/web/full-screen-page.web';
import { SideDrawer } from '@/core/web/side-drawer.web';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useReactive } from '@/core/web/use-reactive.web';
import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { useMapStore } from '@/features/map/presentation/web/map-store.web';
import type { TourType } from '@/features/tours/data/models/tour-type';
import type { TourLegs } from '@/features/tours/domain/legs';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { TourDraft } from '@/features/tours/domain/entities/tour';

import type { CreationStage, StagePayload, StageRoute } from './creation-stages.web';
import styles from './tour-creation-dialog.module.css';
import { TourForm, type TourFormHandle, type TourFormPublic } from './tour-form.web';

export type { StageRoute } from './creation-stages.web';

const c = classes(styles);

export type TourCreationHandle = {
  route: () => StageRoute | null;
  routeOf: (index: number) => StageRoute | null;
  snapshotOf: (index: number) => TourDraft | null;
};

type Handover = { location: { lng: number; lat: number }; name: string; elevation: number | null };
type StageChange = {
  tourTypes?: TourType[];
  legs?: TourLegs | null;
  start?: { lng: number; lat: number } | null;
  end?: { lng: number; lat: number } | null;
  track?: LngLat[] | null;
};

/** `date` ("YYYY-MM-DD") `n` days on. */
function daysOn(date: string, n: number) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + n);
  return day.toISOString().slice(0, 10);
}

/** Vue's `watch(source, cb)`: `cb(now, before)` after a change of the JSON-compared source. */
function useWatch(
  now: Record<string, string | null>,
  cb: (now: Record<string, string | null>, before: Record<string, string | null>) => void,
) {
  const before = useRef(now);
  const key = JSON.stringify(now);
  useEffect(() => {
    const was = before.current;
    before.current = now;
    if (JSON.stringify(was) !== key) cb(now, was);
  }, [key]);
}

/**
 * Creating a tour (map-first-tour-creation): a full-screen page on phones, the side drawer beside
 * the map on desktop. One form per stage, all kept mounted so each keeps its edits and uploads; the
 * day tabs on top switch between them, and one save sends them all (D4). What a trip's days share
 * follows from a day to the later days that still held what it held (D11).
 */
export function TourCreationDialog({
  stages,
  active,
  title,
  dayOffset = 0,
  dayCount,
  onConfirm,
  onClose,
  onSelect,
  onRemove,
  onPickPoint,
  onDrawTrack,
  onNextDay,
  onHandoverMoved,
  onStageChange,
  ref,
}: {
  stages: CreationStage[];
  /** The stage on screen. */
  active: number;
  title: string;
  /** Day numbers continue after this many (the outing an added stage joins). */
  dayOffset?: number;
  /** The span a split started from, for "Day 2 of 3". */
  dayCount?: number | null;
  onConfirm: (stages: StagePayload[]) => void;
  onClose: () => void;
  onSelect: (index: number) => void;
  /** Drop a later stage (its form's uploads are already discarded). */
  onRemove: (index: number) => void;
  onPickPoint: (type: 'start' | 'end' | 'goal') => void;
  onDrawTrack: (seed: DrawnTrack | null) => void;
  onNextDay: (split?: number) => void;
  /** The day before stage `index` now ends elsewhere, and the stage still starts where it ended. */
  onHandoverMoved: (index: number, point: Handover) => void;
  /** A stage's form changed what the map draws. */
  onStageChange: (index: number, change: StageChange) => void;
  ref?: React.Ref<TourCreationHandle>;
}) {
  'use no memo';
  const { t } = useTranslation('web');
  const { formatDate } = useFormatter();
  const isPickingLocation = useMapStore((s) => s.isPickingLocation);
  const isDesktop = useIsDesktop();

  const forms = useRef<Record<string, TourFormHandle>>({}).current;
  /** Each form's state as it reported it last (Vue read the exposed refs). */
  const pubs = useReactive(() => ({ byKey: {} as Record<string, TourFormPublic> }));
  const formAt = (i: number) => forms[stages[i]?.key ?? ''];
  const pubAt = (i: number) => pubs.byKey[stages[i]?.key ?? ''];

  /** One label per stage: "Day 2", or "Day 2 of 3" while laying out a split span. */
  function dayLabel(i: number) {
    const n = dayOffset + i + 1;
    return dayCount && n <= dayCount
      ? t('tours.creation.dayOf', { n, count: dayCount })
      : t('tours.creation.day', { n });
  }

  const submitBlocked = stages.some((s) => pubs.byKey[s.key]?.submitBlocked);
  /** The days the save leaves planned: a split counts the tour it splits too. */
  const days = dayCount ? dayOffset + stages.length : stages.length;
  const saveLabel =
    days > 1 ? t('tours.creation.saveDays', { count: days }) : t('tours.creation.saveBtn');

  /** Every stage's payload, or none: the first stage that can't be saved comes to the front. */
  function handleSubmit() {
    if (useMapStore.getState().isPickingLocation) return;
    const payloads: StagePayload[] = [];
    for (const [i, stage] of stages.entries()) {
      const out = formAt(i)?.collect(i === active);
      if (!out) {
        onSelect(i);
        return;
      }
      payloads.push({
        draft: out.draft,
        goal: stage.goal,
        preUploadedTourId: out.preUploadedTourId,
        draftId: out.draftId,
      });
    }
    onConfirm(payloads);
  }

  /** The day a split span still lacks (D5), or null once every day has its stage. */
  const missingN = dayOffset + stages.length + 1;
  const missingDay = dayCount && missingN <= dayCount ? missingN : null;

  /** Closing asks first: a planned route (and every stage's typing) is work to lose. */
  const [confirmingClose, setConfirmingClose] = useState(false);
  function discardAll() {
    stages.forEach((_, i) => formAt(i)?.discard());
    onClose();
  }
  function removeStage(i: number) {
    formAt(i)?.discard();
    onRemove(i);
  }

  /** A day's tab name: its tour name (one line, the tab's title holds it whole). */
  const stageName = (i: number): string => pubAt(i)?.tourName || t('tours.infoSheet.unnamedTour');
  /** Which day the form shows as dated (for the tabs). */
  function stageDate(i: number) {
    const date = pubAt(i)?.plannedDate;
    return date
      ? formatDate(new Date(date), { weekday: 'short', day: 'numeric', month: 'numeric' })
      : null;
  }

  // Past three days on a phone the tabs scroll: the day on screen scrolls into sight.
  const strip = useRef<HTMLElement>(null);
  function showActiveDay(behavior: ScrollBehavior = 'smooth') {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>('.stage--active');
    // Centred in the room the pinned "+" leaves.
    const room =
      (el?.clientWidth ?? 0) - (el?.querySelector<HTMLElement>('.stage-add')?.offsetWidth ?? 0);
    el?.scrollTo?.({ left: tab ? tab.offsetLeft - (room - tab.offsetWidth) / 2 : 0, behavior });
  }
  /** More days lie past the "+": they fade out under it. */
  const [moreDays, setMoreDays] = useState(false);
  function measureDays() {
    const el = strip.current;
    setMoreDays(!!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }
  const hasStrip = stages.length > 1;
  // On the way in, and back from the route step (the form folded away meanwhile, the strip no size).
  useLayoutEffect(() => {
    const el = strip.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      showActiveDay('instant');
      measureDays();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasStrip]);
  const shownActive = useRef(active);
  useEffect(() => {
    if (shownActive.current === active) return;
    shownActive.current = active;
    showActiveDay();
  }, [active]);

  // ── Shared fields follow (D11) ────────────────────────────────────────────
  /** Each day's value of `read`, by stage key (JSON: compared by value). */
  const byStage = (read: (p: TourFormPublic) => unknown) =>
    Object.fromEntries(
      stages.map((s) => [
        s.key,
        pubs.byKey[s.key] ? JSON.stringify(read(pubs.byKey[s.key]!)) : null,
      ]),
    ) as Record<string, string | null>;
  /** A change on one day, handed to every later day for which `take` holds. */
  function onDayChange(
    now: Record<string, string | null>,
    before: Record<string, string | null>,
    take: (j: number, was: unknown, next: unknown, i: number) => void,
  ) {
    stages.forEach((stage, i) => {
      const [next, was] = [now[stage.key], before[stage.key]];
      if (next == null || was == null || next === was) return;
      for (let j = i + 1; j < stages.length; j++) take(j, JSON.parse(was), JSON.parse(next), i);
    });
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  useWatch(
    byStage((p) => p.shared),
    (now, before) =>
      onDayChange(now, before, (j, was, next) => {
        const form = formAt(j);
        const mine = pubAt(j)?.shared as Record<string, unknown> | undefined;
        if (!form || !mine) return;
        const [old, value] = [was as Record<string, unknown>, next as Record<string, unknown>];
        const taken = Object.keys(value).filter(
          (k) => !same(value[k], old[k]) && same(mine[k], old[k]),
        );
        if (taken.length) form.adopt(Object.fromEntries(taken.map((k) => [k, value[k]])));
      }),
  );
  // The dates go on day by day: a later day undated, or still the day after the day after, moves along.
  useWatch(
    byStage((p) => p.plannedDate),
    (now, before) =>
      onDayChange(now, before, (j, was, next, i) => {
        const form = formAt(j);
        const theirs = pubAt(j)?.plannedDate;
        if (form && (theirs === '' || (was && theirs === daysOn(was as string, j - i))))
          form.adopt({ plannedDate: next ? daysOn(next as string, j - i) : '' });
      }),
  );
  // The next day starts where a day ends: when that end moves, a next day still starting at the old
  // spot moves along (the page moves its start and track), and takes the height once looked up there.
  useWatch(
    byStage(
      (p) => p.handover && { location: p.handover.location, elevation: p.handover.elevation },
    ),
    (now, before) =>
      stages.forEach((stage, i) => {
        const [next, was] = [now[stage.key], before[stage.key]];
        const handover = pubAt(i)?.handover;
        const start = formAt(i + 1)?.route().start?.location;
        const old =
          was == null
            ? null
            : (JSON.parse(was) as { location: { lng: number; lat: number } } | null)?.location;
        if (handover && start && old && next !== was && isSameGoal(start, old, 1))
          onHandoverMoved(i + 1, { ...handover, location: { ...handover.location } });
      }),
  );

  useImperativeHandle(ref, () => ({
    route: () => formAt(active)?.route() ?? null,
    routeOf: (i: number) => formAt(i)?.route() ?? null,
    snapshotOf: (i: number) => formAt(i)?.snapshot() ?? null,
  }));

  const content = (
    <>
      {confirmingClose && (
        <div
          className={c('discard')}
          role="alertdialog"
          aria-labelledby="discard-title"
          data-testid="discard-confirm"
        >
          <p id="discard-title" className={c('discard-text')}>
            <BaseIcon name="warning" className={c('discard-icon')} />
            {stages.length > 1
              ? t('tours.creation.discardDays', { count: stages.length })
              : t('tours.creation.discard')}
          </p>
          <div className={c('discard-actions')}>
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              data-testid="discard-keep"
              onClick={() => setConfirmingClose(false)}
            >
              {t('tours.creation.keepEditing')}
            </BaseButton>
            <BaseButton
              type="button"
              variant="danger"
              size="sm"
              data-testid="discard-confirm-btn"
              onClick={discardAll}
            >
              {t('contacts.shared.discardBtn')}
            </BaseButton>
          </div>
        </div>
      )}

      {hasStrip && (
        <nav
          ref={strip}
          className={c('stage-strip', { 'stage-strip--more': moreDays })}
          aria-label={t('tours.creation.daysLabel')}
          data-testid="stage-strip"
          onScroll={measureDays}
        >
          {stages.map((stage, i) => (
            <button
              key={stage.key}
              type="button"
              className={c('stage', { 'stage--active': i === active })}
              aria-current={i === active ? 'step' : undefined}
              title={stageName(i)}
              data-testid={`stage-${i}`}
              onClick={() => onSelect(i)}
            >
              <span className={c('stage-day')}>
                {dayLabel(i)}
                {stageDate(i) && <span className={c('stage-date')}>{stageDate(i)}</span>}
              </span>
              <span className={c('stage-name')}>{stageName(i)}</span>
            </button>
          ))}
          {!missingDay && (
            <span className={c('stage-add')}>
              <BaseIconButton
                name="add"
                variant="tonal"
                label={t('tours.form.nextDayBtn')}
                data-testid="stage-add"
                onClick={() => onNextDay()}
              />
            </span>
          )}
        </nav>
      )}
      {missingDay && (
        <div className={c('missing-day')} data-testid="missing-day">
          <span>
            {t('tours.creation.dayMissing', { day: dayLabel(missingDay - dayOffset - 1) })}
          </span>
          <BaseButton
            type="button"
            variant="primary"
            size="sm"
            data-testid="plan-missing-day"
            onClick={() => onNextDay()}
          >
            <BaseIcon name="add_location_alt" />
            {t('tours.creation.planDay', { day: t('tours.creation.day', { n: missingDay }) })}
          </BaseButton>
        </div>
      )}

      {stages.map((stage, i) => (
        <TourForm
          key={stage.key}
          ref={(handle) => {
            if (handle) forms[stage.key] = handle;
            else delete forms[stage.key];
          }}
          hidden={i !== active}
          formId={`tour-create-form-${i}`}
          idPrefix={i === 0 ? 'tf' : `tf${i}`}
          embedded={!isDesktop}
          submitLabel={saveLabel}
          allowGoalEdit
          currentGoal={stage.goal}
          initialDraft={stage.seed}
          pick={stage.picks}
          drawnTrack={stage.drawnTrack}
          disabled={isPickingLocation}
          stages={i === stages.length - 1}
          end={
            i > 0 ? (
              <div className={c('stage-tools')}>
                <BaseButton
                  type="button"
                  variant="text"
                  size="sm"
                  data-testid="stage-remove"
                  onClick={() => removeStage(i)}
                >
                  <BaseIcon name="delete" />
                  {t('tours.creation.removeDay', { day: dayLabel(i) })}
                </BaseButton>
              </div>
            ) : undefined
          }
          onPublic={(p) => (pubs.byKey = { ...pubs.byKey, [stage.key]: p })}
          onSubmit={handleSubmit}
          onCancel={() => setConfirmingClose(true)}
          onPickPoint={onPickPoint}
          onDrawTrack={onDrawTrack}
          onNextDay={onNextDay}
          onTrackChange={(track) => onStageChange(i, { track })}
          onTourTypesChange={(tourTypes, legs) => onStageChange(i, { tourTypes, legs })}
          onStartPointChange={(start) => onStageChange(i, { start })}
          onEndPointChange={(end) => onStageChange(i, { end })}
        />
      ))}
    </>
  );

  return isDesktop ? (
    <SideDrawer title={title} onClose={() => setConfirmingClose(true)}>
      {content}
    </SideDrawer>
  ) : (
    <FullScreenPage
      title={title}
      collapsed={isPickingLocation}
      onClose={() => setConfirmingClose(true)}
      pageAction={
        <BaseButton
          type="submit"
          form={`tour-create-form-${active}`}
          variant="primary"
          size="sm"
          data-testid="create-save"
          disabled={submitBlocked}
        >
          {saveLabel}
        </BaseButton>
      }
    >
      {content}
    </FullScreenPage>
  );
}
