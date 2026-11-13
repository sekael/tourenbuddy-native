import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { useTrackDrawing } from '@/features/map/presentation/use-track-drawing';

// The terrain profile is a network call: none here, the numbers stay unknown.
jest.mock('@/features/tours/data/services/swisstopo-profile-service', () => ({
  getTrackProfile: jest.fn().mockResolvedValue(null),
}));

const A: LngLat = [7.8, 46.5];
const B: LngLat = [7.81, 46.5];
const C: LngLat = [7.82, 46.5];
const D: LngLat = [7.83, 46.5];

/** A drawn track (straight legs, so every step is exact): A → B (goal) → C. */
const seed: DrawnTrack = {
  points: [A, B, C],
  legs: [
    [A, B],
    [B, C],
  ],
  goal: 1,
};

async function draw(start: DrawnTrack = seed) {
  const hook = await renderHook(() => useTrackDrawing(start, 'straight'));
  const step = async (run: () => void) => {
    const before = hook.result.current.track;
    await act(async () => run());
    await waitFor(() => expect(hook.result.current.track).not.toBe(before));
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
  };
  return { hook, step };
}

describe('useTrackDrawing: shaping the line', () => {
  it('should move a point between and route both of its legs anew', async () => {
    const { hook, step } = await draw();

    await step(() => hook.result.current.move(1, D, 30));

    expect(hook.result.current.track).toEqual({
      points: [A, D, C],
      legs: [
        [A, D],
        [D, C],
      ],
      goal: 1,
    });
  });

  it('should move an end with its one leg only', async () => {
    const { hook, step } = await draw();

    await step(() => hook.result.current.move(2, D, 30));

    expect(hook.result.current.track.legs).toEqual([
      [A, B],
      [B, D],
    ]);
  });

  it('should pull a point out of a leg before the goal and keep the goal its point', async () => {
    const { hook, step } = await draw();

    await step(() => hook.result.current.pull(0, D, 30));

    const { track } = hook.result.current;
    expect(track.points).toEqual([A, D, B, C]);
    expect(track.legs).toEqual([
      [A, D],
      [D, B],
      [B, C],
    ]);
    expect(track.points[track.goal!]).toEqual(B);
  });

  it('should take a pulled point out again, joining its neighbours', async () => {
    const { hook, step } = await draw();
    await step(() => hook.result.current.pull(1, D, 30));

    await step(() => hook.result.current.drop(2));

    expect(hook.result.current.track).toEqual(seed);
  });

  it('should drop an end with its leg, and undo it', async () => {
    const { hook, step } = await draw();

    await step(() => hook.result.current.drop(2));
    expect(hook.result.current.track).toEqual({ points: [A, B], legs: [[A, B]], goal: 1 });

    await act(async () => hook.result.current.undo());
    expect(hook.result.current.track).toEqual(seed);

    await act(async () => hook.result.current.redo());
    expect(hook.result.current.track).toEqual({ points: [A, B], legs: [[A, B]], goal: 1 });
  });

  it('should never drop the goal', async () => {
    const { hook } = await draw();

    await act(async () => hook.result.current.drop(1));

    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(hook.result.current.track).toEqual(seed);
    expect(hook.result.current.canUndo).toBe(false);
  });
});
