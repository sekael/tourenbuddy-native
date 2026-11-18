import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { useTrackDrawing } from '@/features/map/presentation/use-track-drawing';

jest.mock('@/features/tours/data/services/swisstopo-profile-service', () => ({
  getTrackProfile: jest.fn().mockResolvedValue(null),
}));

/** Where a leg along the trails bends: it shows which legs were routed. */
const mockBend: LngLat = [0, 0];
// Along a network a leg bends over `mockBend`; straight it is its two ends.
jest.mock('@/features/map/presentation/leg-router', () => {
  const actual = jest.requireActual('@/features/map/presentation/leg-router');
  const trails = {
    issue: () => null,
    resolve: async (from: LngLat | null, to: LngLat) => ({
      to,
      line: from && [from, mockBend, to],
      off: 0,
    }),
    between: async (from: LngLat, to: LngLat) => [from, mockBend, to],
  };
  return {
    ...actual,
    legRouters: () => (follow: string) => (follow === 'straight' ? actual.straightRouter : trails),
  };
});

const A: LngLat = [7.8, 46.5];
const B: LngLat = [7.81, 46.5];
const C: LngLat = [7.82, 46.5];
const hikeAndFly = { up: 'hiking', down: 'straight' } as const;

describe('useTrackDrawing: each way its own', () => {
  it('should route the way up along the trails and fly the way down straight', async () => {
    const seed: DrawnTrack = { points: [A, B, C], legs: [], goal: 1 };
    const hook = await renderHook(() => useTrackDrawing(seed, hikeAndFly));

    await waitFor(() => expect(hook.result.current.track.legs).toHaveLength(2));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(hook.result.current.track.legs).toEqual([
      [A, mockBend, B],
      [B, C],
    ]);
  });

  it('should draw on from the goal as the way down: straight to the landing', async () => {
    const seed: DrawnTrack = { points: [A, B], legs: [[A, mockBend, B]], goal: 1 };
    const hook = await renderHook(() => useTrackDrawing(seed, hikeAndFly));

    await act(async () => hook.result.current.add(C, 30));

    await waitFor(() => expect(hook.result.current.track.points).toEqual([A, B, C]));
    expect(hook.result.current.track.legs[1]).toEqual([B, C]);
  });
});
