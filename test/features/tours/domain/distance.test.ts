import { isSameGoal, lineEnds } from '@/features/tours/domain/distance';

// Swiss reference: Bern area (~46.95°N, 7.44°E)
const BASE = { lng: 7.44, lat: 46.95 };

// Approximate inverse: 1° lng ≈ 76200m in LV95 at Swiss latitudes, 1° lat ≈ 111320m
// (LV95 easting scale ~211456 per 0.0001 lngShifted unit → ~76124m/degree at 46.95°N)
function offsetByMeters(base: { lng: number; lat: number }, dE: number, dN: number) {
  return {
    lng: base.lng + dE / 76200,
    lat: base.lat + dN / 111320,
  };
}

describe('isSameGoal', () => {
  it('returns true for identical coordinates', () => {
    expect(isSameGoal(BASE, BASE)).toBe(true);
  });

  it('returns true for distance clearly under threshold (5m)', () => {
    const near = offsetByMeters(BASE, 3, 4); // 5m diagonal
    expect(isSameGoal(BASE, near)).toBe(true);
  });

  it('returns false for distance clearly over threshold (20m)', () => {
    const far = offsetByMeters(BASE, 20, 0);
    expect(isSameGoal(BASE, far)).toBe(false);
  });

  it('returns false for clearly different locations (100m apart)', () => {
    const distant = offsetByMeters(BASE, 70.7, 70.7); // ~100m diagonal
    expect(isSameGoal(BASE, distant)).toBe(false);
  });

  it('respects custom threshold', () => {
    const at15m = offsetByMeters(BASE, 15, 0);
    expect(isSameGoal(BASE, at15m, 10)).toBe(false);
    expect(isSameGoal(BASE, at15m, 20)).toBe(true);
  });
});

describe('lineEnds', () => {
  const at = (dE: number, dN: number): [number, number] => {
    const p = offsetByMeters(BASE, dE, dN);
    return [p.lng, p.lat];
  };
  const goal = offsetByMeters(BASE, 0, 3000);

  it('sets no end where the track ends at the goal (a ski route up to its summit)', () => {
    const first = at(0, 0);
    expect(lineEnds(first, at(50, 2900), goal)).toEqual({ start: first, end: null });
  });

  it('sets no start where the track begins at the goal (a flight from it)', () => {
    const last = at(2000, 0);
    expect(lineEnds(at(0, 2950), last, goal)).toEqual({ start: null, end: last });
  });

  it('ends a loop exactly at its start', () => {
    const first = at(0, 0);
    expect(lineEnds(first, at(120, 0), goal).end).toBe(first);
  });

  it('keeps an end elsewhere (a traverse), with or without a goal', () => {
    const [first, last] = [at(0, 0), at(3000, 0)];
    expect(lineEnds(first, last, goal)).toEqual({ start: first, end: last });
    expect(lineEnds(first, last, null)).toEqual({ start: first, end: last });
  });

  it('keeps both ends of a loop from the goal back to it empty', () => {
    expect(lineEnds(at(0, 2990), at(10, 2980), goal)).toEqual({ start: null, end: null });
  });
});
