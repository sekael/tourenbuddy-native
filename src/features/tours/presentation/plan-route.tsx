import { useState } from 'react';

import { useMapStore } from '@/features/map/presentation/stores/map-store';
import { seasonsForDates } from '@/features/tours/data/models/season';
import type { TourType } from '@/features/tours/data/models/tour-type';
import type { TourDraft } from '@/features/tours/domain/entities/tour';

import { PlanSheet } from './plan-sheet';
import { useTourDraftStore } from './stores/tour-draft-store';

/**
 * The route step's route: Add tour begins a new draft; from the form (`back`) or with a seeded one
 * (`keep`: a new segment, its start set) it continues the draft in hand.
 */
export function PlanRoute({ back, keep }: { back: boolean; keep: boolean }) {
  useState(() => {
    if (!(back || keep) || !useTourDraftStore.getState().mode) {
      useTourDraftStore.getState().begin('create', null, newTourGuess(new Date()));
    }
  });
  return <PlanSheet back={back} />;
}

/**
 * What a new tour most likely is, filled in so the form asks less (the app anticipates): the
 * coming weekend day with its season, and the activity of the trails the map shows — ski touring
 * for the ski routes alone (or both in winter and spring), hiking for the hiking trails — else
 * none, for the form to ask. The line's network takes the activity along until the user picks one.
 */
export function newTourGuess(today: Date): Partial<TourDraft> {
  const day = comingWeekendDay(today);
  const seasons = seasonsForDates(day, null);
  const overlays = useMapStore.getState().overlays;
  const snow = seasons.includes('winter') || seasons.includes('spring');
  const ski = overlays.includes('ski');
  const hiking = overlays.includes('hiking');
  const likely: TourType | null = ski && (!hiking || snow) ? 'skitour' : hiking ? 'hiking' : null;
  return { tourTypes: likely ? [likely] : [], plannedDate: day, seasons };
}

/** Today on a Saturday or Sunday, else the next Saturday, as the UTC day tours keep. */
export function comingWeekendDay(today: Date): Date {
  const weekday = today.getDay();
  const ahead = weekday === 0 || weekday === 6 ? 0 : 6 - weekday;
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + ahead));
}
