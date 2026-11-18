import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/core/adaptive/screen';
import { opened } from '@/core/adaptive/page-path';
import type { TourOrigin } from '@/features/map/presentation/open-tour';

import { OutingPage } from './outing-page';
import { TourDetailPage } from './tour-detail-page';

/**
 * A tour's detail as its own sheet (a marker tapped on the map, a link, a notification); with
 * `outing`, the outing's overview (a stage's marker tapped while its outing was closed, D15).
 * Opened from the calendar (`from`), its Back returns there, on the view it was opened from: the
 * Calendar tab keeps its view and day while the map shows the tour.
 */
export function TourSheet({
  id,
  outing,
  from,
}: {
  id: string;
  outing?: string;
  from?: TourOrigin;
}) {
  const { t } = useTranslation();
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
          back={
            from
              ? {
                  label: t(
                    from === 'seasons'
                      ? 'tours.infoSheet.backToSeasons'
                      : 'tours.infoSheet.backToCalendar',
                  ),
                  onPress: () => router.dismissTo('/calendar'),
                }
              : undefined
          }
          onOpenOuting={(key) => push(`outing:${key}`)}
          onOpenTour={(other) => push(`tour:${other}`)}
        />
      )}
    </Screen>
  );
}
