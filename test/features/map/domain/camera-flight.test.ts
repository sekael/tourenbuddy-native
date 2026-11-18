import {
  aboutFramed,
  CLUSTER_FIT_MAX_ZOOM,
  clusterView,
  fittedView,
  flight,
  GLIDE_MS,
  keptOnMap,
  minZoomFor,
  MAX_FLIGHT_MS,
  TOUR_ZOOM,
  type Box,
  type CameraView,
} from '@/features/map/domain/camera-flight';

const phone = { width: 402, height: 874 };
const at = (lng: number, lat: number, zoom: number): CameraView => ({ center: [lng, lat], zoom });
const jungfrau = at(7.96, 46.54, 12);

describe('flight', () => {
  it('should glide about a second to a stage half a screen away, and for a cluster two levels in', () => {
    expect(flight(at(7.98, 46.55, 13), at(8.0, 46.55, 13), phone)).toEqual({
      easing: 'ease',
      duration: GLIDE_MS,
    });
    expect(flight(at(8, 46.6, 10), at(8, 46.6, 12), phone).duration).toBe(GLIDE_MS);
  });

  it('should fly longer the further it goes, never faster than a glide or slower than the cap', () => {
    const near = flight(jungfrau, at(8.2, 46.65, 12), phone); // ~20 km
    const far = flight(jungfrau, at(8.6, 46.9, 12), phone); // ~60 km
    const across = flight(at(6.14, 46.2, 12), at(9.37, 47.42, 12), phone); // Geneva → St. Gallen

    expect([near.easing, far.easing]).toEqual(['fly', 'fly']);
    expect(near.duration).toBeGreaterThanOrEqual(GLIDE_MS);
    expect(far.duration).toBeGreaterThan(near.duration);
    expect(across.duration).toBe(MAX_FLIGHT_MS);
  });

  it('should time a flight that only zooms, many levels in place', () => {
    const { easing, duration } = flight(at(8, 46.6, 7), at(8, 46.6, 14), phone);

    expect(easing).toBe('fly');
    expect(duration).toBeGreaterThan(GLIDE_MS);
    expect(duration).toBeLessThanOrEqual(MAX_FLIGHT_MS);
  });
});

describe('fittedView', () => {
  it('should land on the box middle, as far in as fits beside the sheet', () => {
    const padding = { top: 100, right: 60, bottom: 500, left: 60 };
    const view = fittedView([7.9, 46.5], [8.0, 46.6], phone, padding);
    // One more level would overflow the room the sheet leaves.
    const tighter = fittedView([7.9, 46.5], [8.0, 46.6], phone, { ...padding, bottom: 774 });

    expect(view.center[0]).toBeCloseTo(7.95, 6);
    // The middle on the map: a hair north of halfway in degrees.
    expect(view.center[1]).toBeGreaterThan(46.55);
    expect(view.center[1]).toBeLessThan(46.551);
    expect(view.zoom).toBeGreaterThan(9);
    expect(view.zoom).toBeLessThan(12);
    expect(tighter.zoom).toBeLessThan(view.zoom);
  });
});

describe('aboutFramed', () => {
  // The part above the sheet: about 0.4° wide, 0.3° tall, around Grindelwald.
  const visible: Box = [7.85, 46.5, 8.25, 46.8];
  const first = at(8.06, 46.66, TOUR_ZOOM);
  const goal: [[number, number], [number, number]] = [
    [8.06, 46.66],
    [8.06, 46.66],
  ];

  it('should move a goal that is in view but off-centre, as in the owner\'s screenshot', () => {
    expect(aboutFramed(goal, [7.75, 46.55, 8.15, 46.85], 11, first)).toBe(false);
  });

  it('should leave a centred goal be, at most a level further out', () => {
    const centred: Box = [7.86, 46.51, 8.26, 46.81];
    expect(aboutFramed(goal, centred, 11, first)).toBe(true);
    expect(aboutFramed(goal, centred, 10.9, first)).toBe(false);
  });

  it('should move when a point sits at the edge of the view, centred or not', () => {
    const wide: [[number, number], [number, number]] = [
      [7.87, 46.62],
      [8.25, 46.68],
    ];
    expect(aboutFramed(wide, visible, 12, at(8.05, 46.65, 12))).toBe(false);
  });
});

describe('clusterView', () => {
  const padding = { top: 80, right: 16, bottom: 140, left: 16 };

  it('should drill in at least a level for a country-wide cluster', () => {
    const spots: [number, number][] = [
      [6.14, 46.2],
      [9.37, 47.42],
    ];
    const view = clusterView(spots, [7.8, 46.8], 6.2, 6.6, phone, padding);
    expect(view.zoom).toBeGreaterThanOrEqual(7.6);
  });

  it('should pass the split even when the tours would fit further out', () => {
    const spots: [number, number][] = [
      [7.9, 46.6],
      [7.95, 46.62],
    ];
    expect(clusterView(spots, [7.92, 46.61], 13.4, 9, phone, padding).zoom).toBeCloseTo(13.41, 2);
  });

  it('should frame spread tours in the middle, never at street level for nothing', () => {
    const spots: [number, number][] = [
      [7.9, 46.6],
      [7.9005, 46.6005],
    ];
    const view = clusterView(spots, [7.9, 46.6], 10, 9, phone, padding);
    expect(view.zoom).toBe(CLUSTER_FIT_MAX_ZOOM);
    expect(view.center[0]).toBeCloseTo(7.90025, 5);
  });
});

describe('minZoomFor', () => {
  it('should stop zooming out before the white past the base map shows on a phone', () => {
    // An iPhone's 874 pt: Switzerland whole at about 6.6, not the PWA's desktop 5.8.
    expect(minZoomFor(874)).toBeCloseTo(6.63, 2);
    expect(minZoomFor(1366)).toBeGreaterThan(minZoomFor(874));
  });

  it('should never let a short view zoom out past the PWA\'s limit', () => {
    expect(minZoomFor(200)).toBe(5.8);
    expect(minZoomFor(0)).toBe(5.8);
  });
});

describe('keptOnMap', () => {
  it('should leave a view on the base map be', () => {
    expect(keptOnMap(at(8.2, 46.8, 8), phone)).toBeNull();
  });

  it('should pull a view panned past the north edge back, keeping its east-west place', () => {
    const back = keptOnMap(at(8.2, 48.8, 8), phone)!;
    expect(back[0]).toBeCloseTo(8.2, 6);
    expect(back[1]).toBeLessThan(48.8);
    expect(keptOnMap(at(back[0], back[1], 8), phone)).toBeNull();
  });
});
