import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useHandleReorder } from '@/core/web/use-handle-reorder.web';
import type { Tour } from '@/features/tours/domain/entities/tour';
import {
  outingDateConflicts,
  outingGaps,
  outingNights,
  segmentFinishPlace,
} from '@/features/tours/domain/outing';
import type { RouteMetrics } from '@/features/tours/domain/route-metrics';

import { OutingSegmentCard } from './outing-segment-card.web';
import styles from './outing-segment-timeline.module.css';

const c = classes(styles);
const UNKNOWN: RouteMetrics = { ascent: null, descent: null, distance: null };

/**
 * The outing's segments as a stage plan (#338, D20): numbered cards, and between two of them what
 * happens there: the night, the place handed over at, a gap (the owner may close it in one tap) or
 * dates out of order. `editing` adds drag handles (mouse, pen, finger, arrow keys) and remove.
 */
export function OutingSegmentTimeline({
  segments,
  metrics,
  editing,
  busy,
  canConnect,
  onOpen,
  onReorder,
  onRemove,
  onConnect,
}: {
  segments: Tour[];
  metrics: Map<string, RouteMetrics>;
  editing?: boolean;
  busy?: boolean;
  /** The owner may close a gap (smarter-tour-creation D8). */
  canConnect?: boolean;
  onOpen: (tourId: string) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (tourId: string) => void;
  /** End segment `index - 1` where segment `index` starts. */
  onConnect: (index: number) => void;
}) {
  'use no memo';
  const { t } = useTranslation('web');
  const { formatElevation } = useFormatter();
  const reorder = useHandleReorder(onReorder);

  /** The link above each segment after the first. */
  const gaps = new Set(outingGaps(segments).map((g) => g.index));
  const nights = outingNights(segments);
  const early = outingDateConflicts(segments);
  const links = segments.map((segment, i) => {
    const prev = segments[i - 1];
    if (!prev) return null;
    const night = nights.has(i);
    const { name, elevation } = segmentFinishPlace(prev, segment);
    const place =
      name && (night || prev.endPoint)
        ? [name, elevation != null ? formatElevation(elevation) : null].filter(Boolean).join(' · ')
        : null;
    return { night, place, gap: gaps.has(i), early: early.has(i) };
  });

  return (
    <ol className={c('timeline', { 'timeline--editing': !!editing })}>
      {segments.map((segment, i) => {
        const link = links[i];
        return (
          <li
            key={segment.id}
            className={c('stop')}
            data-reorder-index={i}
            data-testid="outing-segment"
          >
            {link && (
              <div className={c('link', { 'link--warn': link.gap || link.early })}>
                {link.night ? (
                  <span className={c('link-row')} data-testid="segment-night">
                    <BaseIcon name="bed" size="sm" />
                    {[t('tours.outing.night'), link.place].filter(Boolean).join(' · ')}
                  </span>
                ) : link.place ? (
                  <span className={c('link-row')} data-testid="segment-handover">
                    {link.place}
                  </span>
                ) : null}
                {link.gap && (
                  <span className={c('link-row link-row--warn')} data-testid="segment-gap">
                    <BaseIcon name="warning" size="sm" />
                    {t('tours.outing.gapHint', { n: i })}
                    {canConnect && segment.startPoint && (
                      <button
                        type="button"
                        className={c('connect')}
                        disabled={busy}
                        aria-label={t('tours.outing.connectLabel', {
                          n: i,
                          place: segment.startPointName ?? t('tours.outing.connect'),
                        })}
                        data-testid="segment-connect"
                        onClick={() => onConnect(i)}
                      >
                        {t('tours.outing.connect')}
                      </button>
                    )}
                  </span>
                )}
                {link.early && (
                  <span className={c('link-row link-row--warn')} data-testid="segment-early">
                    <BaseIcon name="warning" size="sm" />
                    {t('tours.outing.dateBeforeHint', { n: i })}
                  </span>
                )}
              </div>
            )}
            <OutingSegmentCard
              segment={segment}
              n={i + 1}
              metrics={metrics.get(segment.id) ?? UNKNOWN}
              editing={editing}
              busy={busy}
              handle={busy ? undefined : reorder.handleProps(i, segments.length)}
              dragging={reorder.from === i}
              over={reorder.over === i && reorder.from !== null && reorder.from !== i}
              offset={reorder.offset}
              onOpen={() => onOpen(segment.id)}
              onRemove={() => onRemove(segment.id)}
            />
          </li>
        );
      })}
    </ol>
  );
}
