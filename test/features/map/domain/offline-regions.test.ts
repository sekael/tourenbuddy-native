import {
  boundsAboveSheet,
  estimateBytes,
  SWITZERLAND_REGIONS,
  tileCount,
  type Bounds,
} from '@/features/map/domain/offline-regions';

const SWITZERLAND: Bounds = [5.95, 45.82, 10.49, 47.81];

describe('offline regions', () => {
  it('should count one tile per level for a point-sized region', () => {
    expect(tileCount([8.5, 46.5, 8.5, 46.5], 0, 3)).toBe(4);
  });

  it('should count Switzerland in the tens of thousands of tiles up to zoom 14', () => {
    expect(tileCount(SWITZERLAND)).toBeGreaterThan(30_000);
    expect(tileCount(SWITZERLAND)).toBeLessThan(45_000);
  });

  it('should estimate Switzerland near the measured 2.7 GB, not below it', () => {
    expect(estimateBytes(SWITZERLAND)).toBeGreaterThanOrEqual(2.7e9);
    expect(estimateBytes(SWITZERLAND)).toBeLessThan(3.5e9);
  });

  it('should count nothing for inverted bounds', () => {
    expect(tileCount([9, 47, 8, 46], 10, 10)).toBe(0);
  });

  it('should keep the part above a sheet, and never less than a tenth of it', () => {
    expect(boundsAboveSheet([8, 46, 9, 47], 0.5)).toEqual([8, 46.5, 9, 47]);
    expect(boundsAboveSheet([8, 46, 9, 47], 1)[1]).toBeCloseTo(46.9);
    expect(boundsAboveSheet([8, 46, 9, 47], -1)).toEqual([8, 46, 9, 47]);
  });

  it('should cover Switzerland with its four regions', () => {
    const west = Math.min(...SWITZERLAND_REGIONS.map((r) => r.bounds[0]));
    const east = Math.max(...SWITZERLAND_REGIONS.map((r) => r.bounds[2]));
    expect(west).toBeLessThanOrEqual(SWITZERLAND[0]);
    expect(east).toBeGreaterThanOrEqual(SWITZERLAND[2]);
    SWITZERLAND_REGIONS.slice(1).forEach((region, i) =>
      expect(region.bounds[0]).toBeLessThan(SWITZERLAND_REGIONS[i]!.bounds[2]),
    );
  });
});
