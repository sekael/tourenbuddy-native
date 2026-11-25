import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes, join } from '@/core/web/classes';
import { PaceBadge } from '@/core/web/pace-badge.web';
import { useFormatter } from '@/core/web/use-formatter.web';
import { TOUR_TYPE_ICONS } from '@/features/tours/data/models/tour-type';
import type { Flight, FlownWay } from '@/features/tours/domain/legs';
import type { RouteMetrics } from '@/features/tours/domain/route-metrics';

import styles from './route-numbers.module.css';

const c = classes(styles);
const LABELS = {
  ascent: ['tours.route.ascent', 'tours.route.flightUp', 'tours.route.ascentPartFlown'],
  descent: ['tours.route.descent', 'tours.route.flight', 'tours.route.descentPartFlown'],
} as const;

/**
 * Climb · descent · distance · time as a guide reads them, each only when known; the arrows are
 * spelled out for assistive technology, flown ways shown by their activities.
 */
export function RouteNumbers({
  metrics,
  flight,
  minutes,
  className,
}: {
  metrics: RouteMetrics;
  flight?: Flight;
  minutes?: number | null;
  className?: string;
}) {
  const { t } = useTranslation('web');
  const { formatElevation, formatDistance, formatDuration } = useFormatter();
  const label = (way: keyof typeof LABELS, flown: FlownWay | undefined) =>
    t(LABELS[way][Math.min(flown?.length ?? 0, 2)]);
  if (!(metrics.ascent || metrics.descent || metrics.distance || minutes)) return null;
  return (
    <span className={join(c('route-numbers'), className)}>
      {!!metrics.ascent && (
        <span data-testid="route-ascent">
          <span aria-hidden="true">↑</span>
          {flight?.up?.map((type) => (
            <BaseIcon key={type} name={TOUR_TYPE_ICONS[type]} size="xs" className={c('flown')} />
          ))}
          <span className={c('visually-hidden')}>{label('ascent', flight?.up)}</span>{' '}
          {formatElevation(metrics.ascent)}
        </span>
      )}
      {!!metrics.descent && (
        <span data-testid="route-descent">
          <span aria-hidden="true">↓</span>
          {flight?.down?.map((type) => (
            <BaseIcon key={type} name={TOUR_TYPE_ICONS[type]} size="xs" className={c('flown')} />
          ))}
          <span className={c('visually-hidden')}>{label('descent', flight?.down)}</span>{' '}
          {formatElevation(metrics.descent)}
        </span>
      )}
      {!!metrics.distance && (
        <span data-testid="route-distance">
          <span className={c('visually-hidden')}>{t('tours.route.distance')}</span>{' '}
          {formatDistance(metrics.distance)}
        </span>
      )}
      {!!minutes && (
        <span data-testid="route-time">
          <BaseIcon name="schedule" size="xs" className={c('flown')} />
          <span className={c('visually-hidden')}>{t('tours.route.time')}</span>{' '}
          {formatDuration(minutes)}
          <PaceBadge />
        </span>
      )}
    </span>
  );
}
