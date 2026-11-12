import { useTranslation } from 'react-i18next';

import type { IconName } from '@/core/adaptive/icons';
import { ListRow, type RowAction } from '@/core/adaptive/list';
import { useFormatter } from '@/core/i18n/format';
import { color } from '@/core/theme/tokens';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendDisplayName } from '@/features/friendships/presentation/use-friend-display-name';
import { TOUR_TYPE_COLORS, TOUR_TYPE_ICONS } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingDisplayName, outingSpan } from '@/features/tours/domain/outing';

/** A tour type's glyph as a registry icon; a typeless tour shows the generic tour glyph. */
export function tourIcon(tour: Pick<Tour, 'tourTypes'>): { icon: IconName; tint: string } {
  const type = tour.tourTypes[0];
  return type
    ? { icon: TOUR_TYPE_ICONS[type] as IconName, tint: TOUR_TYPE_COLORS[type] }
    : { icon: 'tour', tint: color.primary };
}

/**
 * One tour in the list (tour-list-view): the activity's glyph in its colour, the name, then grade,
 * date and partners (own tours) or "by <friend>" (friends' tours). A friend's name renders once,
 * final: until it settles the subtitle holds its line empty, so nothing swaps in later.
 */
export function TourRow({
  tour,
  onPress,
  pendingSuggestions = 0,
  swipeActions,
  leadingSwipeActions,
  contextActions,
  span,
}: {
  tour: Tour;
  onPress: () => void;
  /** A day of a multi-day tour (the calendar's day list): "Day 2 of 3" leads the subtitle. */
  span?: { day: number; total: number };
  pendingSuggestions?: number;
  swipeActions?: RowAction[];
  leadingSwipeActions?: RowAction[];
  contextActions?: RowAction[];
}) {
  const { t } = useTranslation();
  const { formatDate } = useFormatter();
  const contacts = useContactsStore((s) => s.contacts);
  const owner = useFriendDisplayName(tour.isFriendTour ? tour.userId : null);
  const { icon, tint } = tourIcon(tour);

  const date = tour.plannedDate;
  const dateLabel = date
    ? formatDate(date, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
      })
    : null;

  const spanLabel = span
    ? t('calendar.planned.dayCounterLabel', { day: span.day, total: span.total })
    : null;
  let subtitle: string;
  if (tour.isFriendTour) {
    subtitle = owner.isResolved
      ? [
          spanLabel,
          tour.grade,
          t('tours.list.ownedByLabel', { name: owner.displayName ?? '' }),
          dateLabel,
        ]
          .filter(Boolean)
          .join(' · ')
      : ' ';
  } else {
    const partners = tour.partnerIds
      .map((id) => contacts.find((c) => c.id === id))
      .filter((c) => c !== undefined)
      .map(resolveContactName)
      .join(', ');
    subtitle = [spanLabel, tour.grade, dateLabel, partners || null].filter(Boolean).join(' · ');
  }

  return (
    <ListRow
      title={tour.name ?? t('tours.infoSheet.unnamedTour')}
      subtitle={subtitle || undefined}
      icon={tour.completed ? 'check_circle' : icon}
      iconColor={tour.completed ? color.success : tint}
      badge={pendingSuggestions > 0 ? pendingSuggestions : undefined}
      onPress={onPress}
      swipeActions={swipeActions}
      leadingSwipeActions={leadingSwipeActions}
      contextActions={contextActions}
      accessibilityLabel={[
        tour.name ?? t('tours.infoSheet.unnamedTour'),
        tour.completed ? t('tours.infoSheet.completedBtn') : null,
        subtitle.trim() || null,
      ]
        .filter(Boolean)
        .join(', ')}
    />
  );
}

/** One row standing for a whole outing: its name, segment count and span. */
export function OutingRow({ segments, onPress }: { segments: Tour[]; onPress: () => void }) {
  const { t } = useTranslation();
  const { formatDateRange } = useFormatter();
  const first = segments[0]!;
  const owner = useFriendDisplayName(first.isFriendTour ? first.userId : null);
  const span = outingSpan(segments);
  const { tint } = tourIcon(first);
  const subtitle =
    first.isFriendTour && !owner.isResolved
      ? ' '
      : [
          first.isFriendTour
            ? t('tours.list.ownedByLabel', { name: owner.displayName ?? '' })
            : null,
          t('tours.outing.segmentCount', { count: segments.length }),
          span ? formatDateRange(span.start, span.end, { day: 'numeric', month: 'short' }) : null,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <ListRow
      title={outingDisplayName(segments) ?? t('tours.infoSheet.unnamedTour')}
      subtitle={subtitle}
      icon="timeline"
      iconColor={tint}
      onPress={onPress}
    />
  );
}
