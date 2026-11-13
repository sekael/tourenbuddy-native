import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useMapStore } from '@/features/map/presentation/stores/map-store';

import { resultKey, resultSubtitle, useLocationSearch } from './use-location-search';

/**
 * The map's place search (map-integration): a place, hut or stop by name; picking one flies the
 * map there. The same search as the route step's.
 */
export function PlaceSearchSheet() {
  const { t } = useTranslation();
  const search = useLocationSearch('goal');
  const typed = search.query.trim().length >= 2;
  return (
    <Screen>
      <Page
        title={t('map.search.title')}
        onClose={() => router.back()}
        search={{
          value: search.query,
          onChange: search.setQuery,
          prompt: t('tours.picker.search.placeholder'),
        }}
      >
        {search.failed ? (
          <ListSection>
            <ListRow title={t('tours.picker.search.error')} icon="warning" />
          </ListSection>
        ) : null}
        <ListSection>
          {search.results.slice(0, 10).map((result) => (
            <ListRow
              key={resultKey(result)}
              title={result.name}
              subtitle={resultSubtitle(t, result)}
              icon={result.origin === 'stop' ? 'directions_bus' : 'location_on'}
              onPress={() => {
                search.take(result);
                useMapStore.getState().requestCamera({
                  kind: 'fly',
                  center: [result.lng, result.lat],
                  zoom: Math.max(result.zoom ?? 13, 13),
                });
                router.back();
              }}
            />
          ))}
        </ListSection>
        {!typed ? <EmptyState icon="search" title={t('map.search.hint')} /> : null}
      </Page>
    </Screen>
  );
}
