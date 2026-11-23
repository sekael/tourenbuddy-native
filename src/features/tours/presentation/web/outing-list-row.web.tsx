import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useFriendDisplayName } from '@/features/friendships/presentation/web/use-friend-display-name.web';
import {
  cssFill,
  distinctTypeColors,
  TOUR_TYPE_COLORS,
} from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingDisplayName, outingSpan } from '@/features/tours/domain/outing';

import styles from './outing-list-row.module.css';

const c = classes(styles);

/** One tour-list row standing for a whole outing (#338, design D18). */
export function OutingListRow({ segments, onClick }: { segments: Tour[]; onClick: () => void }) {
  const { t } = useTranslation('web');
  const { formatDateRange } = useFormatter();
  const first = segments[0]!;
  const name = outingDisplayName(segments) ?? t('tours.infoSheet.unnamedTour');

  // The segments' colours split like a multi-activity marker; one colour tints like a tour row.
  const colors = distinctTypeColors(
    segments.flatMap((s) => s.tourTypes),
    TOUR_TYPE_COLORS,
  );
  const avatarStyle: CSSProperties | undefined =
    colors.length > 1
      ? { background: cssFill(colors), color: 'var(--color-on-primary)' }
      : colors.length === 1
        ? ({ '--avatar-tint': colors[0] } as CSSProperties)
        : undefined;

  const { displayName: ownerName, isResolved: ownerResolved } = useFriendDisplayName(
    first.isFriendTour ? first.userId : null,
  );
  const span = outingSpan(segments);
  const subtitle = [
    first.isFriendTour && ownerName ? t('tours.list.ownedByLabel', { name: ownerName }) : null,
    t('tours.outing.segmentCount', { count: segments.length }),
    span ? formatDateRange(span.start, span.end, { day: 'numeric', month: 'short' }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={c('tour-row')} data-testid="outing-row" onClick={onClick}>
      <div className={c('tour-avatar')} style={avatarStyle}>
        <BaseIcon name="timeline" />
        {first.isFriendTour && <BaseIcon name="group" className={c('friend-badge')} />}
      </div>
      <div className={c('tour-info')}>
        <span className={c('tour-name')}>{name}</span>
        {/* A friend's outing names its owner in the accent colour, like a friend's tour row. */}
        {!first.isFriendTour || ownerResolved ? (
          <span className={c(first.isFriendTour ? 'tour-owner' : 'tour-subtitle')}>{subtitle}</span>
        ) : (
          <span className={c('tour-owner-skeleton')} aria-hidden="true" />
        )}
      </div>
      <BaseIcon name="chevron_right" className={c('row-arrow')} />
    </li>
  );
}
