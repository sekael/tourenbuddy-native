import { create } from 'zustand';

import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

/** The pace slider's range, a speed factor on the rule of thumb: tortoise to hare. */
export const PACE_MIN = 0.5;
export const PACE_MAX = 1.5;
export const PACE_STEP = 0.1;

/** A pace as a factor with one decimal and its times sign ("1.2×"). */
export const formatPace = (value: number) => `${value.toFixed(1)}×`;

/**
 * The user's pace for every time the app estimates (the PWA's core `pace` ref): the profile
 * carries it to every device, a slider moves it at once and writes it once it rests.
 */
const usePaceStore = create(() => ({ pace: useUserProfileStore.getState().profile?.pace ?? 1 }));

// A profile cached before the column has none and leaves the pace alone.
useUserProfileStore.subscribe((s, prev) => {
  const value = s.profile?.pace;
  if (value != null && value !== prev.profile?.pace) usePaceStore.setState({ pace: value });
});

let paceTimer: ReturnType<typeof setTimeout> | undefined;
export function setPace(value: number) {
  usePaceStore.setState({ pace: value });
  clearTimeout(paceTimer);
  // One write once the slider rests, not one per step.
  paceTimer = setTimeout(() => {
    const profile = useUserProfileStore.getState().profile;
    if (profile && profile.pace !== value)
      useUserProfileStore
        .getState()
        .updateProfile({ pace: value })
        .catch(() => {}); // logs itself
  }, 600);
}

export const usePace = () => usePaceStore((s) => s.pace);
export const currentPace = () => usePaceStore.getState().pace;
