import { router } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/core/adaptive/screen';
import { opened } from '@/core/adaptive/page-path';

import { OutingPage } from './outing-page';
import { TourDetailPage } from './tour-detail-page';

/**
 * A tour's detail as its own sheet (a marker tapped on the map, a link, a notification); with
 * `outing`, the outing's overview (a stage's marker tapped while its outing was closed, D15).
 */
export function TourSheet({ id, outing }: { id: string; outing?: string }) {
  const [path, setPath] = useState<string[]>([]);
  const push = (value: string) => setPath((p) => opened(p, value));
  // The outing at the sheet's root is gone back to, never pushed again.
  const openOuting = (key: string) => (key === outing ? setPath([]) : push(`outing:${key}`));
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
            onOpenOuting={openOuting}
            onOpenTour={(other) => push(`tour:${other}`)}
          />
        ) : value.startsWith('outing:') ? (
          <OutingPage outingKey={value.slice(7)} onOpenTour={(other) => push(`tour:${other}`)} />
        ) : null
      }
    >
      {outing ? (
        <OutingPage
          outingKey={outing}
          onClose={() => router.back()}
          onOpenTour={(other) => push(`tour:${other}`)}
        />
      ) : (
        <TourDetailPage
          id={id}
          onClose={() => router.back()}
          onGone={() => router.back()}
          onOpenOuting={(key) => push(`outing:${key}`)}
          onOpenTour={(other) => push(`tour:${other}`)}
        />
      )}
    </Screen>
  );
}
