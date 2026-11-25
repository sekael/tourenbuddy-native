import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useMapStore } from '@/features/map/presentation/web/map-store.web';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingDisplayName, outingKey, outingSegments } from '@/features/tours/domain/outing';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './outing-navigator.module.css';

const c = classes(styles);

/** Where a segment sits in its outing, with a way to the overview and the neighbours (#338). */
export function OutingNavigator({
  tour,
  onOpenOuting,
}: {
  tour: Tour;
  onOpenOuting: (outingKey: string) => void;
}) {
  const { t } = useTranslation('web');
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const selectTour = useMapStore((s) => s.selectTour);

  const key = outingKey(tour);
  const segments = outingSegments([...tours, ...friendTours], key);
  const index = segments.findIndex((s) => s.id === tour.id);
  const prev = segments[index - 1] ?? null;
  const next = segments[index + 1] ?? null;
  if (!key || index < 0) return null;

  return (
    <nav className={c('navigator')} aria-label={t('tours.outing.openOverview')}>
      <button
        type="button"
        className={c('outing')}
        data-testid="outing-overview-link"
        onClick={() => onOpenOuting(key)}
      >
        <BaseIcon name="timeline" className={c('outing-icon')} />
        <span className={c('outing-text')}>
          <span className={c('outing-name')}>{outingDisplayName(segments)}</span>
          <span className={c('outing-position')}>
            {t('tours.outing.segmentOf', { n: index + 1, count: segments.length })}
          </span>
        </span>
      </button>
      <button
        type="button"
        className={c('step')}
        aria-label={t('tours.outing.previous')}
        disabled={!prev}
        data-testid="segment-prev"
        onClick={() => prev && selectTour(prev.id)}
      >
        <BaseIcon name="chevron_left" />
      </button>
      <button
        type="button"
        className={c('step')}
        aria-label={t('tours.outing.next')}
        disabled={!next}
        data-testid="segment-next"
        onClick={() => next && selectTour(next.id)}
      >
        <BaseIcon name="chevron_right" />
      </button>
    </nav>
  );
}
