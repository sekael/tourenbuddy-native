import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useMapStore } from '@/features/map/presentation/stores/map-store';

import { OutingPage } from './outing-page';
import { useToursStore } from './stores/tours-store';
import { TourDetailPage } from './tour-detail-page';
import { TourRow } from './tour-rows';

/**
 * Tours on one spot (map-integration "Stack list"): zooming never splits them, so a tap on their
 * cluster lists them here; a row pushes the tour's detail in the same sheet.
 */
export function StackSheet() {
  const ids = useMapStore((s) => s.stack) ?? [];
  // The route is singular: another cluster tapped while open replaces the list and starts over.
  return <StackList key={ids.join()} ids={ids} />;
}

function StackList({ ids }: { ids: string[] }) {
  const { t } = useTranslation();
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const [path, setPath] = useState<string[]>([]);
  const push = (value: string) => setPath((p) => [...p, value]);
  const listed = ids
    .map((id) => tours.find((x) => x.id === id) ?? friendTours.find((x) => x.id === id))
    .filter((x) => x !== undefined);

  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(value) =>
        value.startsWith('tour:') ? (
          <TourDetailPage
            id={value.slice(5)}
            onGone={() => setPath((p) => p.slice(0, -1))}
            onOpenOuting={(key) => push(`outing:${key}`)}
            onOpenTour={(id) => push(`tour:${id}`)}
          />
        ) : value.startsWith('outing:') ? (
          <OutingPage outingKey={value.slice(7)} onOpenTour={(id) => push(`tour:${id}`)} />
        ) : null
      }
    >
      <Page
        title={t('map.cluster.stackTitle', { count: listed.length })}
        onClose={() => router.back()}
      >
        <ListSection>
          {listed.map((tour) => (
            <TourRow key={tour.id} tour={tour} onPress={() => push(`tour:${tour.id}`)} />
          ))}
        </ListSection>
      </Page>
    </Screen>
  );
}
