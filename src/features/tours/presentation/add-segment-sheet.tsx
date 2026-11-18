import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { createLogger } from '@/core/logging/logger';
import { nextSegmentSeed, outingKey, outingSegments } from '@/features/tours/domain/outing';

import { useTourDraftStore } from './stores/tour-draft-store';
import { tourToDraft, useToursStore } from './stores/tours-store';
import { TourRow } from './tour-rows';

const log = createLogger('AddSegment');

/**
 * "Add a segment" after a tour (tour-outings): a new goal on the map, starting the day after where
 * this one ends, or one of the user's standalone tours. One day is one tour; a night starts the
 * next segment.
 */
export function AddSegmentSheet({ anchorId }: { anchorId: string }) {
  const { t } = useTranslation();
  const tours = useToursStore((s) => s.tours);
  const anchor = tours.find((x) => x.id === anchorId);
  const [busy, setBusy] = useState(false);
  const candidates = tours
    .filter((x) => x.id !== anchorId && outingSegments(tours, outingKey(x)).length === 0)
    .sort(
      (a, b) => (a.plannedDate?.getTime() ?? Infinity) - (b.plannedDate?.getTime() ?? Infinity),
    );

  function planNew() {
    if (!anchor) return;
    const seed = nextSegmentSeed({ ...tourToDraft(anchor), goal: anchor.goal });
    const store = useTourDraftStore.getState();
    store.begin('create', null, seed);
    store.setSegmentOf(anchor.id);
    // The route step is on the map, as for a new tour: the sheets close first, and the tour's
    // sheet comes back if the segment is given up.
    useTourDraftStore.setState({ returnTo: anchor.id });
    if (router.canDismiss()) router.dismissAll();
    router.navigate('/');
    router.push({ pathname: '/plan', params: { keep: '1' } });
  }

  async function addExisting(tourId: string) {
    setBusy(true);
    try {
      await useToursStore.getState().addToOuting(anchorId, tourId);
      router.back();
    } catch (error) {
      log.error('Adding a segment failed', error);
      Alert.alert(t('tours.outing.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Page title={t('tours.outing.addTitle')} onClose={() => router.back()}>
        <ListSection footer={t('tours.outing.ruleHint')}>
          <ListRow
            title={t('tours.outing.addNew')}
            subtitle={t('tours.outing.addNewHint')}
            icon="add_location_alt"
            onPress={planNew}
          />
        </ListSection>
        {candidates.length ? (
          <ListSection title={t('tours.outing.addExistingHeader')}>
            {candidates.map((tour) => (
              <TourRow
                key={tour.id}
                tour={tour}
                onPress={() => (busy ? undefined : void addExisting(tour.id))}
              />
            ))}
          </ListSection>
        ) : (
          <EmptyState icon="tour" title={t('tours.outing.addExistingEmpty')} />
        )}
      </Page>
    </Screen>
  );
}
