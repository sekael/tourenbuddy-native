import {
  fittedView,
  flight,
  GLIDE_MS,
  MAX_FLIGHT_MS,
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

    expect(view.center).toEqual([7.95, 46.55]);
    expect(view.zoom).toBeGreaterThan(9);
    expect(view.zoom).toBeLessThan(12);
    expect(tighter.zoom).toBeLessThan(view.zoom);
  });
});
