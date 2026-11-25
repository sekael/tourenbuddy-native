import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { connectivity } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { ExtendedFab } from '@/core/web/extended-fab.web';
import { Transition } from '@/core/web/transition.web';
import { useNextTick } from '@/core/web/use-next-tick.web';
import { useScrollLock } from '@/core/web/use-scroll-lock.web';
import { useAvailabilityStore } from '@/features/calendar/presentation/stores/availability-store';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { ContactsListSheet } from '@/features/contacts/presentation/web/contacts-list-sheet.web';
import { useMapStore } from '@/features/map/presentation/web/map-store.web';
import type { TourSurface } from '@/features/onboarding/presentation/web/onboarding-steps.web';
import {
  OnboardingTourBanner,
  tourSlideCls,
} from '@/features/onboarding/presentation/web/onboarding-tour-banner.web';
import {
  OnboardingWelcome,
  welcomeCls,
} from '@/features/onboarding/presentation/web/onboarding-welcome.web';
import {
  useOnboardingTour,
  type StageContext,
} from '@/features/onboarding/presentation/web/use-onboarding-tour.web';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { CalendarNav, type CalendarView } from './calendar-nav.web';
import styles from './calendar-page.module.css';
import { CALENDAR_TOUR_STEPS, makeDemoChips, makeDemoSeason } from './calendar-tour.web';
import { PlannedCalendar, type PlannedCalendarHandle } from './planned-calendar.web';
import { SeasonsGantt } from './seasons-gantt.web';

const c = classes(styles);
const firstOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * The calendar (`calendar-page.vue`): planned (month grid or day list, availability) and seasons
 * views, the view a query param; its own spotlight tour.
 */
export function CalendarPage() {
  'use no memo';
  const { t, i18n } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const params = useLocalSearchParams<{ view?: string; day?: string }>();
  const editing = useAvailabilityStore((s) => s.editing);
  const saving = useAvailabilityStore((s) => s.saving);
  const hasFeeds = useCalendarFeedStore((s) => s.feeds.length > 0);
  const availability = () => useAvailabilityStore.getState();
  const nextTick = useNextTick();
  const planned = useRef<PlannedCalendarHandle>(null);

  // The view is a query param (deep-linkable, restored by the detail's back); planned by default.
  const activeView: CalendarView = params.view === 'seasons' ? 'seasons' : 'planned';
  const viewNow = useRef(activeView);
  viewNow.current = activeView;
  function setView(view: CalendarView) {
    // Leaving the planned view discards an availability edit (Cancel, no prompt).
    if (availability().editing) availability().cancel();
    viewNow.current = view;
    router.setParams({ view });
  }

  // Only edit mode shows the calendar note, so only edit mode pays for the feed query.
  useEffect(() => {
    if (editing) void useCalendarFeedStore.getState().loadFeeds();
  }, [editing]);

  // A friend chip's menu → Edit opens the contact over the calendar.
  const [editContactId, setEditContactId] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState(() => firstOfMonth());
  const shiftMonth = (delta: number) =>
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  function goToday() {
    setCurrentMonth(firstOfMonth());
    // Once the list re-rendered and laid out, so scrollIntoView measures final rows.
    void nextTick().then(() => requestAnimationFrame(() => planned.current?.scrollTodayIntoView()));
  }
  // The planned tab is a double action: from seasons it switches, on planned it scrolls to today.
  function onNavSelect(view: CalendarView) {
    if (view === 'planned' && activeView === 'planned') goToday();
    else setView(view);
  }
  const monthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
  }).format(currentMonth);

  // Back → the tour list on the map; a tour → its detail on the map, remembering where it came from.
  function goBack() {
    if (availability().editing) availability().cancel();
    useMapStore.getState().setPendingIntent({ openTours: true });
    router.push('/map');
  }
  function selectTour(tourId: string, originDay?: string) {
    useMapStore.getState().setPendingIntent({
      selectTourId: tourId,
      origin: activeView === 'seasons' ? 'cal-seasons' : 'cal-planned',
      originDay,
    });
    router.push('/map');
  }

  // ── The calendar spotlight tour: this page stages each surface.
  // Today's row centered, clear of the banner, across every planned-view step.
  async function centerDemoToday() {
    if (viewNow.current !== 'planned') return;
    await nextTick();
    await new Promise(requestAnimationFrame);
    planned.current?.scrollTodayIntoView('center');
  }
  async function stageCalendarSurface(surface: TourSurface, ctx: StageContext) {
    switch (surface) {
      case 'day-chips':
        if (viewNow.current !== 'planned') setView('planned');
        await centerDemoToday();
        await ctx.spotlight('[data-tour="demo-chips"]', 'calendar.tour.nav.dayDetails');
        planned.current?.openDetailForDay(new Date());
        break;
      case 'availability':
      case 'today-nav':
        planned.current?.closeDetail();
        if (viewNow.current !== 'planned') setView('planned');
        await centerDemoToday();
        break;
      case 'seasons':
        planned.current?.closeDetail();
        await ctx.spotlight('[data-tour="nav-seasons"]', 'calendar.tour.nav.seasons');
        setView('seasons');
        break;
    }
    await nextTick();
  }

  const profile = useUserProfileStore.getState;
  const calendarTour = useOnboardingTour({
    steps: CALENDAR_TOUR_STEPS,
    stage: stageCalendarSurface,
    // Every exit returns to the planned view.
    cleanup: () => {
      planned.current?.closeDetail();
      if (viewNow.current !== 'planned') setView('planned');
    },
    // Four steps, no resume: dismissing flips the gate.
    saveTourStep: () => {},
    getResumeStep: () => 0,
    dismissTourAtSignIn: () => profile().dismissCalendarTour(),
    // Offline the tour stays away (the calendar is always reachable); the gate stays fresh.
    canAutoStart: () =>
      connectivity.getState().online && profile().profile?.calendarTourShowOnFirstOpen === true,
  });
  const tourRunning = calendarTour.isRunning;
  const tourWelcome = calendarTour.showWelcome;
  // Demo content exists only while the tour runs.
  const demoChips = tourRunning ? makeDemoChips(tk) : null;
  const demoSeason = tourRunning ? makeDemoSeason(tk) : null;
  // Banner clearance only while the seasons chart is spotlit.
  const seasonsTourActive = tourRunning && activeView === 'seasons';
  const tourLockActive = tourRunning || tourWelcome;
  // Soft lock only: blocking this page's scroll on iOS shrinks the viewport.
  useScrollLock(tourLockActive);

  // Entering planned from seasons scrolls to today, unless the tour drives its own scroll.
  const prevView = useRef(activeView);
  useEffect(() => {
    const prev = prevView.current;
    prevView.current = activeView;
    if (activeView === 'planned' && prev !== 'planned' && !calendarTour.isRunningNow()) goToday();
  }, [activeView]);

  useEffect(() => {
    // The calendar-tour gate: a fresh gate shows the welcome (online only), a spent one nothing.
    // The map tour's hand-off intent is consumed on every mount so it never re-fires.
    useMapStore.getState().consumePendingIntent();
    calendarTour.maybeStartTour();

    // Cold path (a deep link straight here): the map page normally loaded these.
    if (useToursStore.getState().tours.length === 0) void useToursStore.getState().loadTours();
    void availability().load();
    void availability().loadFriends();
    if (useContactsStore.getState().contacts.length === 0)
      void useContactsStore.getState().loadContacts();

    // Back from a tour opened off the calendar: reopen that day (one-shot `day` param).
    if (viewNow.current !== 'planned') return () => calendarTour.stop();
    const focusDay = typeof params.day === 'string' && params.day ? params.day : null;
    if (focusDay) {
      const [y, m, d] = focusDay.split('-').map(Number);
      setCurrentMonth(new Date(y!, m! - 1, 1));
      void nextTick().then(() => {
        planned.current?.openDetailForDay(new Date(y!, m! - 1, d!));
        router.setParams({ view: 'planned', day: undefined });
      });
    } else goToday();
    // The tour's overlay lives on <body>: torn down when the page goes.
    return () => calendarTour.stop();
  }, []);

  return (
    <div className={c('calendar-page', { 'calendar-page--tour-locked': tourLockActive })}>
      {createPortal(
        <Transition name="tour-slide" cls={tourSlideCls}>
          {tourRunning && (
            <OnboardingTourBanner
              title={calendarTour.currentTitle}
              current={calendarTour.currentIndex + 1}
              total={calendarTour.totalSteps}
              canBack={calendarTour.currentIndex > 0}
              busy={calendarTour.isStaging}
              onBack={() => calendarTour.back()}
              onNext={() => calendarTour.next()}
              onFinish={() => calendarTour.finish()}
            />
          )}
        </Transition>,
        document.body,
      )}
      {createPortal(
        <Transition name="welcome" cls={welcomeCls}>
          {tourWelcome && (
            <OnboardingWelcome
              titleKey="calendar.tour.welcome.title"
              bodyKey="calendar.tour.welcome.body"
              icon="calendar_today"
              onStart={() => calendarTour.startFromWelcome()}
              onSkip={() => calendarTour.skipWelcome()}
              onDismiss={() => calendarTour.dismissWelcome()}
            />
          )}
        </Transition>,
        document.body,
      )}

      <CalendarNav active={activeView} onSelect={onNavSelect} />

      <main className={c('calendar-main')}>
        <header className={c('top-bar')}>
          <div className={c('bar-left')}>
            <BaseIconButton
              name="arrow_back"
              variant="tonal"
              label={t('calendar.back')}
              onClick={goBack}
            />
          </div>
          <div className={c('bar-center')}>
            {activeView === 'planned' ? (
              <>
                <BaseIconButton
                  name="chevron_left"
                  size="sm"
                  label={t('calendar.planned.prevMonth')}
                  onClick={() => shiftMonth(-1)}
                />
                <h2 className={c('top-title')}>{monthLabel}</h2>
                <BaseIconButton
                  name="chevron_right"
                  size="sm"
                  label={t('calendar.planned.nextMonth')}
                  onClick={() => shiftMonth(1)}
                />
              </>
            ) : (
              <h2 className={c('top-title')}>{t('calendar.seasons.title')}</h2>
            )}
          </div>
          <div className={c('bar-right')}>
            {/* Always-visible replay: the calendar tour on demand, past the gate. */}
            <BaseIconButton
              name="help"
              size="md"
              label={t('calendar.tour.replay')}
              onClick={() => calendarTour.startTour(0)}
            />
          </div>
        </header>

        <div className={c('calendar-canvas', { 'tour-seasons': seasonsTourActive })}>
          {activeView === 'planned' ? (
            <PlannedCalendar
              ref={planned}
              viewDate={currentMonth}
              demoChips={demoChips}
              onSelect={selectTour}
              onEditContact={setEditContactId}
            />
          ) : (
            <SeasonsGantt demoTour={demoSeason} onSelect={selectTour} />
          )}
        </div>

        {activeView === 'planned' && !editing && (
          <ExtendedFab
            className={c('availability-fab')}
            data-tour="availability-edit"
            label={t('calendar.availability.edit')}
            icon={<BaseIcon name="edit" />}
            onClick={() => availability().enterEdit()}
          />
        )}

        {editing && (
          <div className={c('availability-bar')}>
            <p className={c('availability-disclaimer')}>
              {t('calendar.availability.disclaimer')}
              {hasFeeds && (
                <>
                  <br />
                  {t('calendar.availability.calendarNote')}
                </>
              )}
            </p>
            <div className={c('availability-actions')}>
              <BaseButton variant="secondary" size="sm" onClick={() => availability().cancel()}>
                {t('calendar.availability.cancel')}
              </BaseButton>
              <BaseButton
                variant="primary"
                size="sm"
                disabled={saving}
                onClick={() => void availability().save()}
              >
                {t('calendar.availability.save')}
              </BaseButton>
            </div>
          </div>
        )}

        <Transition name="sheet">
          {editContactId !== null && (
            <div key="contact" className="sheet-host">
              <ContactsListSheet
                initialContactId={editContactId}
                onClose={() => setEditContactId(null)}
                // ponytail: the PWA binds neither here, so both buttons do nothing on the calendar.
                onOpenFriendRequests={() => {}}
                onShowFriendTours={() => {}}
              />
            </div>
          )}
        </Transition>
      </main>
    </div>
  );
}
