import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { classes } from '@/core/web/classes';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './linked-with-section.module.css';

const c = classes(styles);

export function LinkedWithSection({
  siblings,
  fullList = false,
  onOpenTour,
  onViewAll,
}: {
  /** Tour ids of the group siblings (excluding the current tour). */
  siblings: string[];
  /** Render the complete sibling list (no overflow pill); the sheet provides back and close. */
  fullList?: boolean;
  onOpenTour: (tourId: string) => void;
  onViewAll?: () => void;
}) {
  const { t } = useTranslation('web');
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  useContactsStore((s) => s.contacts);

  /** A sibling neither own nor friend tours hold is unreachable from here: its pill is inert. */
  const isResolvable = (id: string) =>
    tours.some((x) => x.id === id) || friendTours.some((x) => x.id === id);
  const tourName = (id: string) =>
    tours.find((x) => x.id === id)?.name ??
    friendTours.find((x) => x.id === id)?.name ??
    t('tours.infoSheet.unnamedTour');
  // A sibling can belong to a group member who is not a direct friend: "Unknown buddy" then.
  function partnerName(id: string): string {
    if (tours.some((x) => x.id === id)) return ''; // own sibling — no partner label
    const friendTour = friendTours.find((x) => x.id === id);
    if (!friendTour) return t('tourLinks.unknownPartner');
    const resolved = resolveFriendName(friendTour.userId, phoneMap, (phone) =>
      useContactsStore.getState().findContactByMethodValue('phone', phone),
    );
    return resolved || t('tourLinks.unknownPartner');
  }
  /** Pill label: "{partnerName}: {tourName}", or just tourName for own siblings. */
  const pillLabel = (id: string) => {
    const name = partnerName(id);
    return name ? `${name}: ${tourName(id)}` : tourName(id);
  };

  /** The viewer's own tours first, both in the pill row and the full list. */
  const own = siblings.filter((id) => tours.some((x) => x.id === id));
  const ordered = [...own, ...siblings.filter((id) => !own.includes(id))];
  const inlineIds = ordered.slice(0, 2);
  const overflowCount = ordered.length - inlineIds.length;

  // One batched phone lookup for the sibling owners so pills aren't blank.
  const siblingKey = siblings.join();
  useEffect(() => {
    const owners = [
      ...new Set(
        siblings
          .map((id) => friendTours.find((x) => x.id === id)?.userId)
          .filter((uid): uid is string => !!uid),
      ),
    ];
    if (owners.length > 0) void useFriendshipsStore.getState().ensurePhones(owners);
  }, [siblingKey]);

  const open = (id: string) => isResolvable(id) && onOpenTour(id);

  if (siblings.length === 0) return null;
  return (
    <section className={c('linked-with-section')}>
      {!fullList && <h4 className={c('section-title')}>{t('tourLinks.linkedWithHeader')}</h4>}
      {!fullList ? (
        <div className={c('pills-row')}>
          {inlineIds.map((id) => (
            <button
              key={id}
              type="button"
              className={c('pill', { 'pill--inert': !isResolvable(id) })}
              disabled={!isResolvable(id)}
              onClick={() => open(id)}
            >
              {pillLabel(id)}
            </button>
          ))}
          {overflowCount > 0 && (
            <button type="button" className={c('pill pill--more')} onClick={onViewAll}>
              {t('tourLinks.moreLinked', { count: overflowCount })}
            </button>
          )}
        </div>
      ) : (
        <ul className={c('full-list')}>
          {ordered.map((id) => (
            <li key={id}>
              <button
                type="button"
                className={c('full-row', { 'full-row--inert': !isResolvable(id) })}
                disabled={!isResolvable(id)}
                onClick={() => open(id)}
              >
                <span className={c('full-name')}>{partnerName(id) || tourName(id)}</span>
                {partnerName(id) && <span className={c('full-tour')}>{tourName(id)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
