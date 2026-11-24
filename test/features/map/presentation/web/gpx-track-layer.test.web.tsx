import type { Tour } from '@/features/tours/domain/entities/tour';
import { tourConnectors } from '@/features/map/presentation/web/gpx-track-layer.web';
import { TOUR_FILL } from '../../../../fixtures/tour-fill';

// maplibre-gl ships an ES module alone, which Jest can't load; the connectors never touch it.
jest.mock('maplibre-gl', () => ({}), { virtual: true });

const START = { lng: 8.95, lat: 46.5 };
const GOAL = { lng: 8.99, lat: 46.5 };

const tour = (over: Partial<Tour>): Tour =>
  ({
    ...TOUR_FILL,
    id: 'x',
    userId: 'me',
    name: 'Passo di Piotta',
    goal: GOAL,
    startPoint: START,
    endPoint: START,
    partnerIds: [],
    tourTypes: ['paragliding', 'hiking'],
    gpxFilepath: 'me/x.gpx',
    completed: false,
    ...over,
  }) as Tour;

const coordinates = (tours: Tour[]) =>
  tourConnectors(tours).features.map((f) => f.geometry.coordinates);

describe('tourConnectors', () => {
  it('should fly a hike & fly down straight to the landing beside its out-and-back track', () => {
    const hikeAndFly = tour({ legs: { ascent: ['hiking'], descent: ['paragliding'] } });
    expect(coordinates([hikeAndFly])).toEqual([
      [
        [GOAL.lng, GOAL.lat],
        [START.lng, START.lat],
      ],
    ]);
  });

  it('should leave the whole way to the track when no way is flown whole', () => {
    const skiToLaunch = tour({
      tourTypes: ['paragliding', 'skitour'],
      legs: { ascent: ['skitour'], descent: ['paragliding', 'skitour'] },
    });
    const hike = tour({ tourTypes: ['hiking'] });
    expect(coordinates([skiToLaunch, hike])).toEqual([]);
  });

  it('should draw no flight without a landing', () => {
    expect(
      coordinates([
        tour({ endPoint: null, legs: { ascent: ['hiking'], descent: ['paragliding'] } }),
      ]),
    ).toEqual([]);
  });
});
