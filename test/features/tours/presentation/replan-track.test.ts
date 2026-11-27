import type { LngLat } from '@/features/map/domain/entities/trail';
import { straightRouter, type LegRouter } from '@/features/map/presentation/leg-router';
import { makeRoundTrip, replanned } from '@/features/tours/presentation/replan-track';
import { useTourDraftStore } from '@/features/tours/presentation/stores/tour-draft-store';

const A: LngLat = [7.8, 46.5];
const B: LngLat = [7.81, 46.51];
const C: LngLat = [7.82, 46.5];
const bend: LngLat = [7.805, 46.49];
/** Along the ski routes a leg bends over `ski`; it shows which legs were routed anew. */
const ski: LngLat = [7.9, 46.6];
const skiRouter: LegRouter = { ...straightRouter, between: async (a, b) => [a, ski, b] };
const routerFor = (follow: string) => (follow === 'straight' ? straightRouter : skiRouter);

/** A route planned as a hike: start A, goal B, landing C, both ways along the trails. */
const hike = {
  points: [A, B, C],
  legs: [
    [A, bend, B],
    [B, bend, C],
  ],
  goal: 1,
};
const line = [A, bend, B, bend, C];
const trails = { up: 'hiking', down: 'hiking' } as const;

describe('replanned', () => {
  it('should fly the way down straight and keep the way up as walked once a glider joins', async () => {
    const next = await replanned(hike, line, trails, { up: 'hiking', down: 'straight' }, routerFor);
    expect(next?.legs).toEqual([
      [A, bend, B],
      [B, C],
    ]);
  });

  it('should route a way along its new network, cutting a route step’s line at its points', async () => {
    const planned = { ...hike, legs: [] };
    const next = await replanned(planned, line, trails, { up: 'ski', down: 'hiking' }, routerFor);
    expect(next?.legs).toEqual([
      [A, ski, B],
      [B, bend, C],
    ]);
  });

  it('should send a round trip back the way it now goes up, through its points between', async () => {
    // Routed on its own, a leg turns at a corner that depends on its direction.
    const corner: LegRouter = { ...straightRouter, between: async (a, b) => [a, [a[0], b[1]], b] };
    const routeFor = (follow: string) => (follow === 'straight' ? straightRouter : corner);
    const loop = { points: [A, C, B, C, A], legs: [], goal: 2 };
    const next = await replanned(
      loop,
      [A, C, B, C, A],
      trails,
      { up: 'ski', down: 'ski' },
      routeFor,
    );
    const up = [
      [A, [A[0], C[1]], C],
      [C, [C[0], B[1]], B],
    ];
    expect(next?.legs).toEqual([...up, up[1]!.slice().reverse(), up[0]!.slice().reverse()]);
    // Flown back, the way down goes straight whatever the way up does.
    const flown = await replanned(
      loop,
      [A, C, B, C, A],
      trails,
      { up: 'ski', down: 'straight' },
      routeFor,
    );
    expect(flown?.legs.slice(2)).toEqual([
      [B, C],
      [C, A],
    ]);
  });

  it('should leave a track as it is when nothing changed, or it has no goal to part its ways', async () => {
    expect(await replanned(hike, line, trails, trails, routerFor)).toBeNull();
    const { goal: _, ...noGoal } = hike;
    expect(
      await replanned(noGoal, line, trails, { up: 'hiking', down: 'straight' }, routerFor),
    ).toBeNull();
  });
});

describe('makeRoundTrip', () => {
  const store = () => useTourDraftStore.getState();
  const start = { lng: A[0], lat: A[1] };
  beforeEach(() => {
    store().begin('create', null, {
      startPoint: start,
      startPointName: 'Fiesch',
      startPointElevation: 1049,
    });
  });

  it('should end where the tour starts, its name and height too, without a track', async () => {
    await makeRoundTrip('Drawn track');
    expect(store().draft).toMatchObject({
      endPoint: start,
      endPointName: 'Fiesch',
      endPointElevation: 1049,
    });
    expect(store().track).toBeNull();
  });

  it('should send a ski route up to its summit back down the same way', async () => {
    const up = { points: [A, B], legs: [[A, bend, B]] };
    store().setTrack({ text: '<gpx/>', label: 'Ski route', line: [A, bend, B], drawing: up });
    await makeRoundTrip('Drawn track');
    expect(store().track?.line).toEqual([A, bend, B, bend, A]);
    expect(store().track?.drawing?.points).toEqual([A, B, A]);
    expect(store().track?.label).toBe('Ski route');
    expect(store().draft.endPoint).toEqual(start);
  });

  it('should mark a route from the route step as the same way back, so the step opens on it', async () => {
    const planned = (p: LngLat, name: string) => ({
      location: { lng: p[0], lat: p[1] },
      name,
      elevation: null,
      loading: false,
    });
    const track = { points: [A, B], legs: [[A, bend, B]], goal: 1 };
    store().setRoute({
      points: { start: planned(A, 'Fiesch'), goal: planned(B, 'Chummehorn'), end: null },
      track,
      backSame: false,
    });
    store().setTrack({ text: '<gpx/>', label: 'Drawn', line: [A, bend, B], drawing: track });
    await makeRoundTrip('Drawn track');
    expect(store().route).toMatchObject({ backSame: true, track: { points: [A, B, A], goal: 1 } });
    expect(store().draft.endPointName).toBe('Fiesch');
    expect(store().track?.line).toEqual([A, bend, B, bend, A]);
  });
});
