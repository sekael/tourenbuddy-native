import { useMapStore } from '@/features/map/presentation/stores/map-store';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { comingWeekendDay, newTourGuess } from '@/features/tours/presentation/plan-route';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';
import { TOUR_FILL } from '../../../fixtures/tour-fill';

const tour = (id: string, tourTypes: Tour['tourTypes']): Tour => ({
  ...TOUR_FILL,
  id,
  userId: 'me',
  plannedDate: null,
  goal: { lng: 7.8, lat: 46.5 },
  name: id,
  partnerIds: [],
  tourTypes,
  elevation: null,
  gpxFilepath: null,
  description: null,
  seasons: null,
  startPoint: null,
  endPoint: null,
  equipment: null,
  notes: null,
  completed: false,
});

// Local dates: 2026-11-12 is a Thursday.
const day = (d: number) => new Date(2026, 10, d, 15, 30);
const utc = (d: number) => new Date(Date.UTC(2026, 10, d));

describe('comingWeekendDay', () => {
  it('is the next Saturday on a weekday, as the UTC day tours keep', () => {
    expect(comingWeekendDay(day(12))).toEqual(utc(14));
    expect(comingWeekendDay(day(16))).toEqual(utc(21)); // Monday
  });

  it('is today on a Saturday or a Sunday', () => {
    expect(comingWeekendDay(day(14))).toEqual(utc(14));
    expect(comingWeekendDay(day(15))).toEqual(utc(15));
  });

  it('crosses a month end', () => {
    expect(comingWeekendDay(new Date(2026, 11, 31))).toEqual(new Date(Date.UTC(2027, 0, 2)));
  });
});

describe('newTourGuess', () => {
  afterEach(() => {
    useToursStore.setState({ tours: [] });
    useMapStore.setState({ overlays: [] });
  });

  it('never takes the activity from past tours: a hiker planning on the ski routes gets a ski tour', () => {
    useToursStore.setState({ tours: [{ ...tour('c', ['hiking']), seasons: ['autumn'] }] });
    useMapStore.setState({ overlays: ['ski'] });
    expect(newTourGuess(day(12)).tourTypes).toEqual(['skitour']);
  });

  it('takes the trails the map shows, ski touring when both show in its season', () => {
    useMapStore.setState({ overlays: ['hiking'] });
    expect(newTourGuess(day(12)).tourTypes).toEqual(['hiking']);
    useMapStore.setState({ overlays: ['hiking', 'ski'] });
    expect(newTourGuess(day(12)).tourTypes).toEqual(['hiking']);
    expect(newTourGuess(new Date(2027, 0, 13)).tourTypes).toEqual(['skitour']);
  });

  it('guesses no activity without trails shown, past hikes or not, but still the day and its season', () => {
    useToursStore.setState({ tours: [{ ...tour('c', ['hiking']), seasons: ['autumn'] }] });
    const guess = newTourGuess(day(12));
    expect(guess.tourTypes).toEqual([]);
    expect(guess.plannedDate).toEqual(utc(14));
    expect(guess.seasons).toEqual(['autumn']);
  });
});
