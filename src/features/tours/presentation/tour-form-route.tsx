import { useState } from 'react';

import { pendingGoalFrom, seedDraftFromPending } from '@/features/tours/domain/suggestion-diff';

import { useTourDraftStore } from './stores/tour-draft-store';
import { useTourSuggestionsStore } from './stores/tour-suggestions-store';
import { useToursStore } from './stores/tours-store';
import { TourFormScreen } from './tour-form-screen';

/**
 * The form's route: a new tour comes from the route step (the draft already begun); editing or
 * suggesting begins the draft from the tour once, unless the form returns from a step with its
 * draft in hand. A suggestion revises the user's own pending one when there is one.
 */
export function TourFormRoute({ id, suggest }: { id: string | null; suggest: boolean }) {
  useState(() => {
    const store = useTourDraftStore.getState();
    const mode = suggest ? 'suggest' : 'edit';
    if (!id || (store.mode === mode && store.tourId === id)) return;
    const { tours, friendTours } = useToursStore.getState();
    const tour = tours.find((t) => t.id === id) ?? friendTours.find((t) => t.id === id);
    if (!tour) return;
    if (!suggest) {
      store.begin('edit', tour);
      return;
    }
    const mine = useTourSuggestionsStore.getState().myPendingFor(tour.id);
    store.begin('suggest', tour, seedDraftFromPending(tour, mine));
    const goal = pendingGoalFrom(mine);
    if (goal) useTourDraftStore.setState({ goal: { lng: goal.lng, lat: goal.lat } });
  });
  return <TourFormScreen />;
}
