import {
  bandLine,
  NO_TYPE_COLOR,
  routeBands,
  routeShares,
  shareColor,
} from '@/features/map/domain/track-bands';
import { TOUR_TYPE_COLORS, TOUR_TYPE_TRACK_COLORS } from '@/features/tours/data/models/tour-type';

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

describe('routeShares', () => {
  const { skitour, paragliding, hiking } = TOUR_TYPE_TRACK_COLORS;

  it('should give a dot on the line the activities’ own colours when asked, at the same places', () => {
    const tour = {
      tourTypes: ['hiking', 'paragliding'] as const,
      legs: { ascent: ['hiking' as const], descent: ['paragliding' as const] },
    };
    const line = routeShares(tour, 0.5);
    const dots = routeShares(tour, 0.5, TOUR_TYPE_COLORS);
    expect(dots.map(({ from, to }) => [from, to])).toEqual(line.map(({ from, to }) => [from, to]));
    expect(dots.map((b) => b.color)).toEqual([
      TOUR_TYPE_COLORS.hiking,
      TOUR_TYPE_COLORS.paragliding,
    ]);
  });

  it('should switch at the goal when the ways differ, banding a way with both ways’ activities', () => {
    // Skitour both ways ("beides"), the glider down only.
    const shares = routeShares(
      {
        tourTypes: ['skitour', 'paragliding'],
        legs: { ascent: ['skitour'], descent: ['skitour', 'paragliding'] },
      },
      0.6,
    );
    const up = shares.filter((b) => b.to <= 0.6);
    const down = shares.filter((b) => b.from >= 0.6);
    expect(up).toEqual([{ from: 0, to: 0.6, color: skitour }]);
    expect(down.length + up.length).toBe(shares.length);
    expect(new Set(down.map((b) => b.color))).toEqual(new Set([skitour, paragliding]));
    // Adjacent bands meet: the gradient has no gap.
    shares.slice(1).forEach((b, i) => expect(b.from).toBeCloseTo(shares[i]!.to));
    expect(shares.at(-1)!.to).toBeCloseTo(1);
  });

  it('should band an unsplit tour’s activities all along, and grey without one', () => {
    const shares = routeShares({ tourTypes: ['hiking', 'paragliding'] }, 0.5);
    expect(new Set(shares.map((b) => b.color))).toEqual(new Set([hiking, paragliding]));
    expect(routeShares({ tourTypes: [] }, null)).toEqual([
      { from: 0, to: 1, color: NO_TYPE_COLOR },
    ]);
  });
});

describe('shareColor', () => {
  const shares = [
    { from: 0, to: 0.6, color: 'up' },
    { from: 0.6, to: 1, color: 'down' },
  ];

  it('should give the colour of the band a spot lies in', () => {
    expect(shareColor(shares, 0.3)).toBe('up');
    expect(shareColor(shares, 0.8)).toBe('down');
  });

  it('should hold to the last band past the end, and give none without bands', () => {
    expect(shareColor(shares, 1.2)).toBe('down');
    expect(shareColor([], 0.5)).toBeUndefined();
  });
});
