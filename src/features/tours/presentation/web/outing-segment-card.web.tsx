import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import {
  cssFill,
  distinctTypeColors,
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  type TourType,
} from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { flight, legsApart } from '@/features/tours/domain/legs';
import type { RouteMetrics } from '@/features/tours/domain/route-metrics';

import { GradeBadge } from './grade-badge.web';
import styles from './outing-segment-card.module.css';
import { RouteNumbers } from './route-numbers.web';

const c = classes(styles);

/**
 * One stage of an outing as a card (#338): number, name with goal height, grade badge + activity ·
 * date, climb and descent. While editing it is dragged around by its handle, or removed.
 */
export function OutingSegmentCard({
  segment,
  n,
  metrics,
  editing,
  busy,
  handle,
  dragging,
  over,
  offset,
  onOpen,
  onRemove,
}: {
  segment: Tour;
  /** 1-based position. */
  n: number;
  metrics: RouteMetrics;
  editing?: boolean;
  busy?: boolean;
  /** The handle's pointer/key listeners (`useHandleReorder`); none while busy. */
  handle?: Record<string, unknown>;
  dragging?: boolean;
  /** The dragged card would land here. */
  over?: boolean;
  /** Vertical px the dragged card has travelled. */
  offset?: number;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const { formatDate, formatElevation } = useFormatter();
  /** Numbered dot in the segment's activity colours: the same split its map marker wears. */
  const colors = distinctTypeColors(segment.tourTypes, TOUR_TYPE_COLORS);
  const names = (types: readonly TourType[]) =>
    types.map((type) => tk(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}`)).join(', ');
  /** "↑ Hiking ↓ Paragliding" for a split stage (activity-legs D4). */
  const legs = legsApart(segment.legs);
  const activities = legs
    ? `↑ ${names(legs.ascent)} ↓ ${names(legs.descent)}`
    : names(segment.tourTypes);
  const meta = [
    activities || null,
    segment.plannedDate
      ? formatDate(segment.plannedDate, { weekday: 'short', day: 'numeric', month: 'short' })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={c('card', {
        'card--editing': !!editing,
        'card--dragging': !!dragging,
        'card--over': !!over,
      })}
      style={dragging ? { transform: `translateY(${offset ?? 0}px)` } : undefined}
    >
      {editing && (
        <button
          type="button"
          className={c('handle')}
          aria-label={t('tours.outing.reorderHandle', { n })}
          disabled={busy}
          data-testid="segment-handle"
          {...handle}
        >
          <BaseIcon name="drag_indicator" />
        </button>
      )}
      <button type="button" className={c('main')} disabled={editing} onClick={onOpen}>
        <span
          className={c('dot')}
          style={colors.length > 0 ? { background: cssFill(colors) } : undefined}
        >
          {n}
        </span>
        <span className={c('text')}>
          <span className={c('title')}>
            <span className={c('name')}>{segment.name ?? t('tours.infoSheet.unnamedTour')}</span>
            {segment.elevation != null && (
              <span className={c('height')}>{formatElevation(segment.elevation)}</span>
            )}
          </span>
          {(meta || segment.grade) && (
            <span className={c('meta')}>
              {segment.grade && <GradeBadge grade={segment.grade} className={c('meta-grade')} />}{' '}
              {meta}
            </span>
          )}
          <RouteNumbers className={c('meta')} metrics={metrics} flight={flight(segment)} />
        </span>
        {!editing && <BaseIcon name="chevron_right" className={c('chevron')} />}
      </button>
      {editing && (
        <button
          type="button"
          className={c('remove')}
          aria-label={t('tours.outing.remove')}
          disabled={busy}
          data-testid="segment-remove"
          onClick={onRemove}
        >
          <BaseIcon name="remove_circle_outline" />
        </button>
      )}
    </div>
  );
}
