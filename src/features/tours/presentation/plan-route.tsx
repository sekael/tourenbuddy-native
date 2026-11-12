import { useState } from 'react';

import { PlanSheet } from './plan-sheet';
import { useTourDraftStore } from './stores/tour-draft-store';

/**
 * The route step's route: Add tour begins a new draft; from the form (`back`) or with a seeded one
 * (`keep`: a new segment, its start set) it continues the draft in hand.
 */
export function PlanRoute({ back, keep }: { back: boolean; keep: boolean }) {
  useState(() => {
    if (!(back || keep) || !useTourDraftStore.getState().mode) {
      useTourDraftStore.getState().begin('create');
    }
  });
  return <PlanSheet back={back} />;
}
