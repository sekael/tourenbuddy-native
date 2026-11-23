import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import type { DayEntry } from '@/features/calendar/domain/calendar-dates';
import { TOUR_TYPE_COLORS, TOUR_TYPE_ICONS } from '@/features/tours/data/models/tour-type';

import styles from './day-preview.module.css';

const c = classes(styles);
export type FriendPreview = { userId: string; name: string };

/**
 * One day's preview: per kind, the single item itself or one count chip, so a cell holds at most
 * two short rows.
 */
export function DayPreview({
  entries,
  friends,
}: {
  entries: DayEntry[];
  friends: FriendPreview[];
}) {
  const { t } = useTranslation('web');
  const soleEntry = entries.length === 1 ? entries[0]! : null;
  const soleFriend = friends.length === 1 ? friends[0]! : null;
  const type = soleEntry?.tour.tourTypes[0];
  return (
    <>
      {soleEntry ? (
        <span
          className={c('pill')}
          style={type ? { backgroundColor: TOUR_TYPE_COLORS[type] } : undefined}
        >
          {type && <BaseIcon name={TOUR_TYPE_ICONS[type]} size="xs" />}
          <span className={c('chip-name')}>
            {soleEntry.tour.name ?? t('tours.infoSheet.unnamedTour')}
          </span>
          {/* One tour on N cells reads as one tour only with its day counter. */}
          {soleEntry.dayCount > 1 && (
            <span
              className={c('day-counter')}
              role="img"
              aria-label={t('calendar.planned.dayCounterLabel', {
                day: soleEntry.dayIndex,
                total: soleEntry.dayCount,
              })}
            >
              {t('calendar.planned.dayCounter', {
                day: soleEntry.dayIndex,
                total: soleEntry.dayCount,
              })}
            </span>
          )}
        </span>
      ) : entries.length > 1 ? (
        <span className={c('count-chip')}>
          {t('calendar.planned.tourCount', { count: entries.length })}
        </span>
      ) : null}
      {soleFriend ? (
        <span className={c('friend-chip')}>
          <span className={c('chip-name')}>{soleFriend.name}</span>
        </span>
      ) : friends.length > 1 ? (
        <span className={c('count-chip')}>
          {t('calendar.planned.friendCount', { count: friends.length })}
        </span>
      ) : null}
    </>
  );
}
