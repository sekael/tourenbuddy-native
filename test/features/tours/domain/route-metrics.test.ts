import {
  estimatedMinutes,
  labelMinutes,
  pointMetrics,
  progressNearest,
  routeMetrics,
  totalMetrics,
  tourMinutes,
  trackEnds,
  trackMetrics,
} from '@/features/tours/domain/route-metrics';

const HUT = { lng: 9.86, lat: 46.64 };
const VALLEY = { lng: 9.81, lat: 46.64 };

function heights(overrides: object) {
  return {
    elevation: 3079,
    startPoint: HUT,
    startPointElevation: 2632,
    endPoint: null,
    endPointElevation: null,
    ...overrides,
  };
}

function track(...lines: number[][][]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lines.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })),
  };
}

describe('pointMetrics', () => {
  it('should climb to the goal and descend to a distinct end', () => {
    expect(pointMetrics(heights({ endPoint: VALLEY, endPointElevation: 1822 }))).toEqual({
      ascent: 447,
      descent: 1257,
      distance: null,
    });
  });

  it('should end at the goal when the tour has no end point', () => {
    expect(pointMetrics(heights({}))).toEqual({ ascent: 447, descent: 0, distance: null });
  });

  it('should count every rise as climb and every drop as descent, whichever leg runs which way', () => {
    // Goal below the start (a lift up, then down to a lake): the drop to the goal is descent.
    expect(pointMetrics(heights({ elevation: 1707 }))).toEqual({
      ascent: 0,
      descent: 925,
      distance: null,
    });
    // End above the goal: the rise to the end is climb too.
    expect(pointMetrics(heights({ endPoint: VALLEY, endPointElevation: 3200 }))).toEqual({
      ascent: 568,
      descent: 0,
      distance: null,
    });
  });

  it('should take the start height for a round trip whose end has none', () => {
    expect(pointMetrics(heights({ endPoint: { ...HUT }, endPointElevation: null }))).toEqual({
      ascent: 447,
      descent: 447,
      distance: null,
    });
  });

  it('should count only the goal → end leg without a start — a stage connected without one still has numbers', () => {
    expect(pointMetrics(heights({ startPoint: null }))).toEqual({
      ascent: 0,
      descent: 0,
      distance: null,
    });
    expect(
      pointMetrics(heights({ startPoint: null, endPoint: VALLEY, endPointElevation: 1822 })),
    ).toEqual({ ascent: 0, descent: 1257, distance: null });
    expect(
      pointMetrics(heights({ startPoint: null, endPoint: VALLEY, endPointElevation: 3200 })),
    ).toEqual({ ascent: 121, descent: 0, distance: null });
  });

  it('should leave out a leg that lacks a height and still count the other', () => {
    expect(
      pointMetrics(
        heights({ startPointElevation: null, endPoint: VALLEY, endPointElevation: 1822 }),
      ),
    ).toEqual({ ascent: 0, descent: 1257, distance: null });
    expect(pointMetrics(heights({ endPoint: VALLEY, endPointElevation: null }))).toEqual({
      ascent: 447,
      descent: 0,
      distance: null,
    });
    // A round trip's end borrows the start's height — neither leg counts when the start has none.
    expect(pointMetrics(heights({ startPointElevation: null, endPoint: { ...HUT } }))).toEqual({
      ascent: 0,
      descent: 0,
      distance: null,
    });
    expect(
      pointMetrics(heights({ elevation: null, endPoint: VALLEY, endPointElevation: 1822 })),
    ).toEqual({ ascent: 0, descent: 0, distance: null });
  });
});

describe('trackMetrics', () => {
  it('should not turn recorder noise on a flat stretch into climb', () => {
    const noisy = [0, 3, -2, 4, 1, -3, 2].map((d, i) => [9.8 + i * 0.001, 46.6, 1800 + d]);
    expect(trackMetrics(track(noisy))).toMatchObject({ ascent: 0, descent: 0 });
  });

  it('should count real swings past the threshold both ways, across track segments', () => {
    const up = [
      [9.8, 46.6, 1800],
      [9.801, 46.6, 1900],
      [9.802, 46.6, 1850],
    ];
    const down = [
      [9.81, 46.6, 2000],
      [9.811, 46.6, 1700],
    ];
    expect(trackMetrics(track(up, down))).toMatchObject({ ascent: 100, descent: 350 });
  });

  it('should give the horizontal distance and no heights for a track without them', () => {
    const m = trackMetrics(
      track([
        [9.8, 46.6],
        [9.8, 46.61],
      ]),
    );
    expect(m.ascent).toBeNull();
    expect(m.distance).toBeCloseTo(1112, -1);
  });

  it('should know nothing for a file without lines (waypoints only)', () => {
    const points: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [9.8, 46.6] } },
      ],
    };
    expect(trackMetrics(points)).toEqual({ ascent: null, descent: null, distance: null });
  });
});

describe('routeMetrics', () => {
  it('should keep the point climb but take the distance from a track without heights', () => {
    expect(
      routeMetrics(
        heights({}),
        track([
          [9.8, 46.6],
          [9.8, 46.61],
        ]),
      ),
    ).toMatchObject({ ascent: 447, descent: 0, distance: expect.any(Number) });
  });
});

describe('routeMetrics of a split tour (activity-legs)', () => {
  const GOAL = { lng: 8.02, lat: 46.6 };
  // Walk up to the goal through a 100 m dip, then fly: a 300 m thermal on the way down to 600 m.
  const hikeAndFly = track([
    [8, 46.6, 600],
    [8.01, 46.6, 1100],
    [8.015, 46.6, 1000],
    [8.02, 46.6, 1600],
    [8.03, 46.6, 1200],
    [8.04, 46.6, 1500],
    [8.05, 46.6, 600],
  ]);
  const legs = { ascent: ['hiking'], descent: ['paragliding'] } as const;

  it("should count every rise and drop of the walk and only the flight's net drop", () => {
    expect(
      routeMetrics(
        {
          ...heights({}),
          goal: GOAL,
          legs: { ascent: [...legs.ascent], descent: [...legs.descent] },
        },
        hikeAndFly,
      ),
    ).toMatchObject({ ascent: 1100, descent: 1100 });
  });

  it("should count a lone glider's walk up the same, though saved unsplit", () => {
    expect(
      routeMetrics({ ...heights({}), goal: GOAL, tourTypes: ['paragliding'] }, hikeAndFly),
    ).toMatchObject({ ascent: 1100, descent: 1100 });
  });

  it('should count a way up flown in thermals as its net climb, and no distance for a day flown both ways', () => {
    const both = { ascent: ['paragliding' as const], descent: ['paragliding' as const] };
    expect(
      routeMetrics(
        { ...heights({}), goal: GOAL, tourTypes: ['paragliding'], legs: both },
        hikeAndFly,
      ),
    ).toEqual({ ascent: 1000, descent: 1000, distance: null });
  });

  it('should measure only the walked way when the way up is flown', () => {
    const tour = {
      ...heights({}),
      goal: GOAL,
      tourTypes: ['paragliding' as const, 'hiking' as const],
      legs: { ascent: ['paragliding' as const], descent: ['hiking' as const] },
    };
    expect(routeMetrics(tour, hikeAndFly).distance).toBeCloseTo(
      (routeMetrics({ ...tour, legs: null }, hikeAndFly).distance! * 3) / 5,
      -1,
    );
  });

  it('should keep the point numbers but measure only the walk on a flown track without heights', () => {
    const flat = track([
      [8, 46.6],
      [8.01, 46.6],
      [8.015, 46.6],
      [8.02, 46.6],
      [8.03, 46.6],
      [8.04, 46.6],
      [8.05, 46.6],
    ]);
    const glider = { ...heights({}), goal: GOAL, tourTypes: ['paragliding' as const] };
    expect(routeMetrics(glider, flat)).toMatchObject({ ascent: 447, descent: 0 });
    expect(routeMetrics(glider, flat).distance).toBeCloseTo(
      (routeMetrics({ ...glider, tourTypes: [] }, flat).distance! * 2) / 5,
      -1,
    );
  });

  it("should count the whole track when no way is flown whole — the flight can't be cut out", () => {
    expect(
      routeMetrics(
        {
          ...heights({}),
          goal: GOAL,
          legs: { ascent: ['skitour'], descent: ['skitour', 'paragliding'] },
        },
        hikeAndFly,
      ),
    ).toMatchObject({ ascent: 1400, descent: 1400 });
  });

  it("should measure a flown tour's distance on the way up only", () => {
    const tour = {
      ...heights({}),
      goal: GOAL,
      legs: { ascent: [...legs.ascent], descent: [...legs.descent] },
    };
    expect(routeMetrics(tour, hikeAndFly).distance).toBeCloseTo(
      (routeMetrics({ ...tour, legs: null }, hikeAndFly).distance! * 2) / 5,
      -1,
    );
  });

  it('should keep the whole-track numbers for an unsplit tour', () => {
    expect(routeMetrics({ ...heights({}), goal: GOAL }, hikeAndFly)).toMatchObject({
      ascent: 1400,
      descent: 1400,
    });
  });
});

describe('totalMetrics', () => {
  it('should total what the routes know and know nothing only when none does', () => {
    const total = totalMetrics([
      { ascent: 1265, descent: 0, distance: null },
      { ascent: null, descent: null, distance: 8400 },
      { ascent: 300, descent: 900, distance: null },
    ]);
    expect(total).toEqual({ ascent: 1565, descent: 900, distance: 8400 });
    expect(totalMetrics([])).toEqual({ ascent: null, descent: null, distance: null });
  });
});

describe('progressNearest', () => {
  it('should measure along the line to the vertex nearest the point', () => {
    const line = [
      [8, 46],
      [8.01, 46],
      [8.03, 46],
    ];
    expect(progressNearest(line, { lng: 8.0101, lat: 46.001 })).toBeCloseTo(1 / 3, 2);
  });

  it('should be 0 for a line without length', () => {
    expect(progressNearest([[8, 46]], { lng: 9, lat: 47 })).toBe(0);
  });
});

describe('trackEnds', () => {
  it('should have no ends without a point', () => {
    expect(trackEnds({ type: 'FeatureCollection', features: [] })).toBeNull();
  });

  it('should take the first point of the first line and the last of the last, across features', () => {
    const line = (coordinates: number[][]) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates },
    });
    const multi = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'MultiLineString' as const,
        coordinates: [
          [[3, 3, 900]],
          [
            [4, 4],
            [5, 5],
          ],
        ],
      },
    };
    expect(
      trackEnds({
        type: 'FeatureCollection',
        features: [
          line([
            [1, 1],
            [2, 2],
          ]),
          multi,
        ],
      }),
    ).toEqual({ first: { lng: 1, lat: 1 }, last: { lng: 5, lat: 5 } });
  });
});

describe('estimatedMinutes', () => {
  it('should know no time without a distance', () => {
    expect(estimatedMinutes({ ascent: 500, descent: 0, distance: null })).toBeNull();
  });

  it('should count the shorter of flat and vertical time half (SAC rule), slower up on foot than on skis', () => {
    // 4 km flat = 60 min; 600 m up = 120 min on foot → 120 + 30.
    expect(estimatedMinutes({ ascent: 600, descent: 0, distance: 4000 })).toBe(150);
    // On skis 600 m up = 90 min → 90 + 30.
    expect(estimatedMinutes({ ascent: 600, descent: 0, distance: 4000 }, true)).toBe(120);
    // Unknown heights: the flat time alone.
    expect(estimatedMinutes({ ascent: null, descent: null, distance: 4000 })).toBe(60);
  });

  it("should take the time at the user's pace: twice as long at the slowest, 2/3 at the fastest", () => {
    const climb = { ascent: 600, descent: 0, distance: 4000 };
    expect([estimatedMinutes(climb, false, 0.5), estimatedMinutes(climb, false, 1.5)]).toEqual([
      300, 100,
    ]);
  });
});

describe('labelMinutes', () => {
  it('should read SAC\'s "04:30 h" and know no time in any other wording', () => {
    expect([labelMinutes('04:30 h'), labelMinutes('3-4 h'), labelMinutes('')]).toEqual([
      270,
      null,
      null,
    ]);
  });
});

describe('tourMinutes', () => {
  const climb = { ascent: 600, descent: 0, distance: 4000 };

  it('should time no flown way and no day on a bike alone, and time a tour without activity on foot', () => {
    expect(
      tourMinutes(
        climb,
        {
          tourTypes: ['hiking', 'paragliding'],
          legs: { ascent: ['hiking'], descent: ['paragliding'] },
        },
        1,
      ),
    ).toBeNull();
    expect(tourMinutes(climb, { tourTypes: ['mountain-biking'] }, 1)).toBeNull();
    expect(tourMinutes(climb, { tourTypes: [] }, 1.2)).toBe(125);
  });

  it('should go on skis for a ski tour, and on foot once hiking joins it', () => {
    expect(tourMinutes(climb, { tourTypes: ['skitour', 'mountaineering'] }, 1)).toBe(120);
    expect(tourMinutes(climb, { tourTypes: ['skitour', 'hiking'] }, 1)).toBe(150);
  });
});
