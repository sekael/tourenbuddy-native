import {
  boundsAboveSheet,
  estimateBytes,
  framedBounds,
  REGION_FRAME,
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

  it('should never estimate below what the device stored for an Alpine region', () => {
    // Packs saved on the device (2026-11-14): about 19 tile positions took 8.7 MB, 21 took 12 MB,
    // 56 took 18 MB. A region with as many positions or more is estimated at least as large.
    const point: Bounds = [7.9, 46.59, 7.9, 46.59];
    const valley: Bounds = [7.88, 46.57, 7.94, 46.61];
    const wider: Bounds = [7.85, 46.55, 7.97, 46.63];
    expect(tileCount(point)).toBeLessThan(19);
    expect(estimateBytes(point)).toBeGreaterThanOrEqual(8.7e6);
    expect(tileCount(valley)).toBeGreaterThan(21);
    expect(estimateBytes(valley)).toBeGreaterThanOrEqual(12e6);
    expect(tileCount(wider)).toBeGreaterThanOrEqual(56);
    expect(estimateBytes(wider)).toBeGreaterThanOrEqual(18e6);
  });

  it('should count the fonts and sprites once even for a point', () => {
    expect(estimateBytes([8.5, 46.5, 8.5, 46.5])).toBeGreaterThan(3e6);
  });

  it('should count nothing for inverted bounds', () => {
    expect(tileCount([9, 47, 8, 46], 10, 10)).toBe(0);
  });

  it('should keep the part above a sheet, and never less than a tenth of it', () => {
    expect(boundsAboveSheet([8, 46, 9, 47], 0.5)).toEqual([8, 46.5, 9, 47]);
    expect(boundsAboveSheet([8, 46, 9, 47], 1)[1]).toBeCloseTo(46.9);
    expect(boundsAboveSheet([8, 46, 9, 47], -1)).toEqual([8, 46, 9, 47]);
  });

  it('should take the framed part of the view, inset from each edge', () => {
    const [w, s, e, n] = framedBounds([8, 46, 9, 47], {
      top: 0.1,
      right: 0.2,
      bottom: 0.5,
      left: 0,
    });
    expect([w, s, e, n].map((x) => Number(x.toFixed(6)))).toEqual([8, 46.5, 8.8, 46.9]);
  });

  it('should frame a region clear of the step sheet at its taller height', () => {
    expect(REGION_FRAME.bottom).toBeGreaterThan(0.55);
    expect(REGION_FRAME.top + REGION_FRAME.bottom).toBeLessThan(1);
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
