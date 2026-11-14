import type { LngLat } from '@/features/map/domain/entities/trail';
import { straightRouter, type LegRouter } from '@/features/map/presentation/leg-router';
import { replanned } from '@/features/tours/presentation/replan-track';

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

  it('should leave a track as it is when nothing changed, or it has no goal to part its ways', async () => {
    expect(await replanned(hike, line, trails, trails, routerFor)).toBeNull();
    const { goal: _, ...noGoal } = hike;
    expect(
      await replanned(noGoal, line, trails, { up: 'hiking', down: 'straight' }, routerFor),
    ).toBeNull();
  });
});
