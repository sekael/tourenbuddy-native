import type { DayEntry } from '@/features/calendar/domain/calendar-dates';
import type { OnboardingStep } from '@/features/onboarding/presentation/web/onboarding-steps.web';
import type { Season } from '@/features/tours/data/models/season';
import type { Tour } from '@/features/tours/domain/entities/tour';

type Translate = (key: string) => string;

/**
 * The calendar tour's demo content (a new user has nothing to point at): never written to a store,
 * rendered only through the tour-gated branches of the planned calendar and the seasons chart.
 */
export function makeDemoChips(t: Translate): {
  entries: DayEntry[];
  friends: { userId: string; name: string }[];
} {
  const tour = {
    id: 'demo-tour',
    userId: 'demo',
    plannedDate: new Date(),
    endDate: null,
    goal: { lng: 8.0, lat: 46.8 },
    name: t('calendar.tour.demo.tourName'),
    partnerIds: [],
    tourTypes: ['skitour'],
    completed: false,
    visibility: 'friends',
    isFriendTour: false,
  } as unknown as Tour;
  return {
    entries: [{ tour, isFriend: false, dayIndex: 1, dayCount: 1 }],
    friends: [{ userId: 'demo-friend', name: t('calendar.tour.demo.friendName') }],
  };
}

/** One demo season bar for the seasonal-overview step. */
export function makeDemoSeason(t: Translate): { name: string; seasons: Season[] } {
  return { name: t('calendar.tour.demo.seasonTourName'), seasons: ['winter', 'spring'] };
}

/**
 * The calendar spotlight tour, in screen order: what a day shows (demo chips), sharing
 * availability, then the nav (tap again for today) and the seasonal overview. The page stages each
 * surface.
 */
export const CALENDAR_TOUR_STEPS: OnboardingStep[] = [
  {
    // The today cell is a waypoint; the opened detail overview is the final target.
    surface: 'day-chips',
    target: '[data-tour="demo-detail"]',
    titleKey: 'calendar.tour.dayChips.title',
    bodyKey: 'calendar.tour.dayChips.body',
    labelKey: 'calendar.tour.labels.dayChips',
    scrollBlock: 'center',
  },
  {
    // The FAB sits bottom-right: the popover above it, never flipped into the banner.
    surface: 'availability',
    target: '[data-tour="availability-edit"]',
    titleKey: 'calendar.tour.availability.title',
    bodyKey: 'calendar.tour.availability.body',
    labelKey: 'calendar.tour.labels.availability',
    side: 'top',
  },
  {
    // `bottom` clears the banner on the desktop sidebar; on phones driver.js flips it up.
    surface: 'today-nav',
    target: '[data-tour="nav-planned"]',
    titleKey: 'calendar.tour.todayNav.title',
    bodyKey: 'calendar.tour.todayNav.body',
    labelKey: 'calendar.tour.labels.todayNav',
    side: 'bottom',
  },
  {
    // The demo row itself, first in the chart, so the header stays in view.
    surface: 'seasons',
    target: '[data-tour="demo-row"]',
    scrollBlock: 'nearest',
    titleKey: 'calendar.tour.seasons.title',
    bodyKey: 'calendar.tour.seasons.body',
    labelKey: 'calendar.tour.labels.seasons',
  },
];
