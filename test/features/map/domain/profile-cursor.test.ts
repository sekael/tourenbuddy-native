import { haversineMeters } from '@/core/utils/haversine';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { cursorLabelBox, profileSpot, trackProfile } from '@/features/map/domain/profile-cursor';

const line: LngLat[] = [
  [7.8, 46.5],
  [7.81, 46.5],
  [7.82, 46.5],
];
const leg = haversineMeters(line[0]!, line[1]!);

describe('profileSpot', () => {
  it('should place the spot between two points and give the height between theirs', () => {
    const spot = profileSpot(line, [1000, 1200, 1100], leg / 2)!;
    expect(spot.point[0]).toBeCloseTo(7.805, 5);
    expect(spot.point[1]).toBeCloseTo(46.5, 5);
    expect(spot.height).toBeCloseTo(1100, 0);
    expect(spot.distance).toBeCloseTo(leg / 2, 3);
    // A quarter of the way along a line of two equal legs.
    expect(spot.share).toBeCloseTo(0.25, 3);
  });

  it('should hold to the line’s ends for a finger left of the start or right of the end', () => {
    expect(profileSpot(line, [1000, 1200, 1100], -50)!.point).toEqual(line[0]);
    const past = profileSpot(line, [1000, 1200, 1100], leg * 5)!;
    expect(past.point[0]).toBeCloseTo(7.82, 6);
    expect(past.height).toBe(1100);
    expect(past.distance).toBeCloseTo(leg * 2, 3);
  });

  it('should bridge a point without a height with its neighbours’ heights', () => {
    expect(profileSpot(line, [1000, null, 1200], leg)!.height).toBeCloseTo(1100, 0);
  });

  it('should keep the nearest height beyond the last point that has one', () => {
    expect(profileSpot(line, [1000, 1200, null], leg * 1.5)!.height).toBe(1200);
  });

  it('should give nothing for a line with fewer than two heights', () => {
    expect(profileSpot(line, [1000, null, null], leg)).toBeNull();
    expect(profileSpot([line[0]!], [1000], 0)).toBeNull();
  });
});

describe('trackProfile', () => {
  it('should join a track’s pieces end to end with their heights', () => {
    const shape = trackProfile([
      [
        [7.8, 46.5, 1000],
        [7.81, 46.5, 1100],
      ],
      [
        [7.82, 46.5],
        [7.83, 46.5, 1300],
      ],
    ])!;
    expect(shape.line).toEqual([
      [7.8, 46.5],
      [7.81, 46.5],
      [7.82, 46.5],
      [7.83, 46.5],
    ]);
    expect(shape.heights).toEqual([1000, 1100, null, 1300]);
  });

  it('should give no profile for a track without heights', () => {
    expect(
      trackProfile([
        [
          [7.8, 46.5],
          [7.81, 46.5, 1000],
        ],
      ]),
    ).toBeNull();
  });
});

describe('cursorLabelBox', () => {
  const text = '1647 m · 5.9 km';

  it('should sit right of the cursor in the chart’s left half and left of it in the right half', () => {
    const left = cursorLabelBox(100, text, 44, 316);
    expect(left.x).toBe(106);
    const right = cursorLabelBox(250, text, 44, 316);
    expect(right.x + right.width).toBe(244);
  });

  it('should stay inside the chart at its ends', () => {
    const box = cursorLabelBox(300, 'a much longer label · 120.5 km', 44, 316);
    expect(box.x).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(316);
  });
});
