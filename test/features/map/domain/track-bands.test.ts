import { bandLine, NO_TYPE_COLOR, routeBands } from '@/features/map/domain/track-bands';
import { TOUR_TYPE_TRACK_COLORS } from '@/features/tours/data/models/tour-type';

// About 1.5 km east along a parallel, with a vertex in the middle.
const line = [
  [7.8, 46.56],
  [7.81, 46.56],
  [7.82, 46.56],
];

describe('bandLine', () => {
  it('should draw one colour as the whole line', () => {
    expect(bandLine(line, ['#9A3412'])).toEqual([{ color: '#9A3412', coordinates: line }]);
  });

  it('should switch to the way down at the goal, each way in its own colour', () => {
    const bands = bandLine(line, ['#7C2D12'], { at: 0.5, colors: ['#804604'] });
    expect(bands.map((b) => b.color)).toEqual(['#7C2D12', '#804604']);
    // Both meet at the middle vertex, where the goal is.
    expect(bands[0]!.coordinates.at(-1)![0]).toBeCloseTo(7.81, 9);
    expect(bands[1]!.coordinates[0]![0]).toBeCloseTo(7.81, 9);
  });

  it('should alternate several colours in bands that meet end to start', () => {
    const bands = bandLine(line, ['#E11D48', '#D97706']);
    expect(bands).toHaveLength(18);
    expect(bands.slice(0, 3).map((b) => b.color)).toEqual(['#E11D48', '#D97706', '#E11D48']);
    bands.slice(1).forEach((band, i) => {
      expect(band.coordinates[0]![0]).toBeCloseTo(bands[i]!.coordinates.at(-1)![0]!, 9);
    });
    expect(bands[0]!.coordinates[0]).toEqual([7.8, 46.56]);
    expect(bands.at(-1)!.coordinates.at(-1)![0]).toBeCloseTo(7.82, 9);
  });

  it('should hold one way only when the goal sits at an end of the line', () => {
    expect(bandLine(line, ['#up'], { at: 1, colors: ['#down'] }).map((b) => b.color)).toEqual([
      '#up',
    ]);
    expect(bandLine(line, ['#up'], { at: 0, colors: ['#down'] }).map((b) => b.color)).toEqual([
      '#down',
    ]);
  });

  it('should leave a line without length whole', () => {
    const point = [
      [7.8, 46.56],
      [7.8, 46.56],
    ];
    expect(bandLine(point, ['#a', '#b'])).toEqual([{ color: '#a', coordinates: point }]);
  });
});

describe('routeBands', () => {
  const route: GeoJSON.Position[] = [
    [7.8, 46.5],
    [7.81, 46.5],
    [7.82, 46.5],
  ];

  it('should paint a hike & fly rose up to the goal and glider orange from it', () => {
    const bands = routeBands(
      route,
      {
        tourTypes: ['hiking', 'paragliding'],
        legs: { ascent: ['hiking'], descent: ['paragliding'] },
      },
      0.5,
    );
    expect(bands.map((b) => b.color)).toEqual([
      TOUR_TYPE_TRACK_COLORS.hiking,
      TOUR_TYPE_TRACK_COLORS.paragliding,
    ]);
  });

  it('should keep one way’s colours without a way down, and grey without an activity', () => {
    const tour = { tourTypes: ['skitour', 'paragliding'] as const, legs: null };
    expect(new Set(routeBands(route, tour, null).map((b) => b.color))).toEqual(
      new Set([TOUR_TYPE_TRACK_COLORS.skitour, TOUR_TYPE_TRACK_COLORS.paragliding]),
    );
    expect(routeBands(route, { tourTypes: [] }, 0.5).map((b) => b.color)).toEqual([NO_TYPE_COLOR]);
  });
});
