import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendDisplayName } from '@/features/friendships/presentation/web/use-friend-display-name.web';
import { TOUR_TYPE_COLORS, TOUR_TYPE_ICONS } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { routeOrder } from '@/features/tours/domain/legs';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';

import { GradeBadge } from './grade-badge.web';
import styles from './tour-list-row.module.css';
import { TourTypeBadge } from './tour-type-badge.web';

const c = classes(styles);

export function TourListRow({ tour, onClick }: { tour: Tour; onClick: () => void }) {
  const { t } = useTranslation('web');
  const isDesktop = useIsDesktop();
  const { formatDate } = useFormatter();
  const contacts = useContactsStore((s) => s.contacts);
  // Fed by the one feature-wide query (design D15) — no per-row fetch. Offline it reads the
  // cached snapshot (D14): a stale-but-truthful count beats a silent zero.
  const pendingSuggestions = useTourSuggestionsStore((s) =>
    tour.isFriendTour ? 0 : (s.pendingCountByTour[tour.id] ?? 0),
  );

  const displayName = tour.name ?? t('tours.infoSheet.unnamedTour');

  // The activity type IS the row's identity at a glance — same icon+color language the map
  // markers and calendar speak. A multi-activity tour shows the detail's disc instead.
  const multi = tour.tourTypes.length > 1;
  const primaryType = tour.tourTypes[0] ?? null;
  const avatarIcon = primaryType ? TOUR_TYPE_ICONS[primaryType] : 'tour';
  const avatarTint = primaryType
    ? ({ '--avatar-tint': TOUR_TYPE_COLORS[primaryType] } as CSSProperties)
    : undefined;

  // Friend tours: the owner is named by the viewer's OWN contact for them, gated so the name
  // renders once in final form.
  const { displayName: ownerName, isResolved: ownerResolved } = useFriendDisplayName(
    tour.isFriendTour ? tour.userId : null,
  );
  const ownerLabel = ownerName === null ? null : t('tours.list.ownedByLabel', { name: ownerName });

  // Friend-tour rows show only the goal name + owner; partners stay hidden in the list.
  let partnerSubtitle: string | null = null;
  if (!tour.isFriendTour) {
    const names = tour.partnerIds.map((id) => {
      const contact = contacts.find((x) => x.id === id);
      return contact ? resolveContactName(contact) : null;
    });
    partnerSubtitle = names.filter(Boolean).join(', ') || null;
  }

  // When the tour happens is what a planner scans the list for; the year only shows when it
  // isn't this one.
  const date = tour.plannedDate;
  const dateLabel = date
    ? formatDate(date, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
      })
    : null;
  const subtitle = [dateLabel, partnerSubtitle].filter(Boolean).join(' · ') || null;

  return (
    <li className={c('tour-row')} onClick={onClick}>
      {multi ? (
        <TourTypeBadge types={routeOrder(tour)} className={c('tour-avatar')}>
          {tour.isFriendTour && <BaseIcon name="group" className={c('friend-badge')} />}
        </TourTypeBadge>
      ) : (
        <div className={c('tour-avatar')} style={avatarTint}>
          <BaseIcon name={avatarIcon} />
          {tour.isFriendTour && <BaseIcon name="group" className={c('friend-badge')} />}
        </div>
      )}
      <div className={c('tour-info')}>
        <span className={c('tour-name')}>{displayName}</span>
        {/* How hard leads: it decides who comes along before the day does — a friend's tour too. */}
        {tour.isFriendTour && ownerResolved ? (
          <span className={c('tour-owner')}>
            {tour.grade && <GradeBadge grade={tour.grade} className={c('row-grade')} />}
            {dateLabel ? `${ownerLabel} · ${dateLabel}` : ownerLabel}
          </span>
        ) : tour.isFriendTour ? (
          <span className={c('tour-owner-skeleton')} aria-hidden="true" />
        ) : tour.grade || subtitle ? (
          <span className={c('tour-subtitle')}>
            {tour.grade && <GradeBadge grade={tour.grade} className={c('row-grade')} />}
            {subtitle}
          </span>
        ) : null}
      </div>
      {pendingSuggestions > 0 && (
        <span
          className={c('suggestion-badge')}
          title={
            isDesktop
              ? t('tours.suggestions.pendingCount', { count: pendingSuggestions })
              : undefined
          }
        >
          <BaseIcon name="feedback" />
          {pendingSuggestions}
        </span>
      )}
      <BaseIcon name="chevron_right" className={c('row-arrow')} />
    </li>
  );
}
