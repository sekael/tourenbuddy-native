import { router } from 'expo-router';

import { useMapStore } from './stores/map-store';

/**
 * Opens a tour's sheet over the map, from anywhere (the inbox, the calendar, a saved form): the
 * sheets above the tabs close, the Map tab shows and frames the tour, its sheet opens on it.
 */
export function openTour(id: string) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/');
  useMapStore.getState().selectTour(id);
  router.push({ pathname: '/tour/[id]', params: { id } });
}

/**
 * Opens an outing's overview over the map (a stage's marker tapped, D15): the whole outing on the
 * map, its sheet listing the stages. `via` is the stage that led there.
 */
export function openOuting(key: string, via: string) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/');
  useMapStore.getState().selectOuting(key);
  router.push({ pathname: '/tour/[id]', params: { id: via, outing: key } });
}
