import { router } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/core/adaptive/screen';
import { opened } from '@/core/adaptive/page-path';

import { OutingPage } from './outing-page';
import { TourDetailPage } from './tour-detail-page';

/** A tour's detail as its own sheet (a marker tapped on the map, a link, a notification). */
export function TourSheet({ id }: { id: string }) {
  const [path, setPath] = useState<string[]>([]);
  const push = (value: string) => setPath((p) => opened(p, value));
  const pop = () => setPath((p) => p.slice(0, -1));
  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(value) =>
        value.startsWith('tour:') ? (
          <TourDetailPage
            id={value.slice(5)}
            onGone={pop}
            onOpenOuting={(key) => push(`outing:${key}`)}
            onOpenTour={(other) => push(`tour:${other}`)}
          />
        ) : value.startsWith('outing:') ? (
          <OutingPage outingKey={value.slice(7)} onOpenTour={(other) => push(`tour:${other}`)} />
        ) : null
      }
    >
      <TourDetailPage
        id={id}
        onClose={() => router.back()}
        onGone={() => router.back()}
        onOpenOuting={(key) => push(`outing:${key}`)}
        onOpenTour={(other) => push(`tour:${other}`)}
      />
    </Screen>
  );
}
