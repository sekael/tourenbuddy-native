import { useState } from 'react';

import { useMapStore } from '@/features/map/presentation/stores/map-store';
import { seasonsForDates, type Season } from '@/features/tours/data/models/season';
import { TOUR_TYPE_VALUES, type TourType } from '@/features/tours/data/models/tour-type';
import type { TourDraft } from '@/features/tours/domain/entities/tour';

import { PlanSheet } from './plan-sheet';
import { useTourDraftStore } from './stores/tour-draft-store';
import { useToursStore } from './stores/tours-store';

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
 * coming weekend day, and the activity the user plans most in that day's season, else the one the
 * map shows trails for when it suits the season (ski touring in winter and spring). Both show in
 * the form and change in a tap.
 */
export function newTourGuess(today: Date): Partial<TourDraft> {
  const day = comingWeekendDay(today);
  const seasons = seasonsForDates(day, null);
  const inSeason = (tour: {
    seasons: Season[] | null;
    plannedDate: Date | null;
    endDate: Date | null;
  }) =>
    (tour.seasons?.length ? tour.seasons : seasonsForDates(tour.plannedDate, tour.endDate)).some(
      (season) => seasons.includes(season),
    );
  const counts = new Map<TourType, number>();
  for (const tour of useToursStore.getState().tours.filter(inSeason)) {
    for (const type of tour.tourTypes) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const overlays = useMapStore.getState().overlays;
  const snow = seasons.includes('winter') || seasons.includes('spring');
  const likely =
    [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    (overlays.includes('ski') && snow ? 'skitour' : overlays.includes('hiking') ? 'hiking' : null);
  return {
    tourTypes: likely && TOUR_TYPE_VALUES.includes(likely) ? [likely] : [],
    plannedDate: day,
    seasons,
  };
}

/** Today on a Saturday or Sunday, else the next Saturday, as the UTC day tours keep. */
export function comingWeekendDay(today: Date): Date {
  const weekday = today.getDay();
  const ahead = weekday === 0 || weekday === 6 ? 0 : 6 - weekday;
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + ahead));
}
