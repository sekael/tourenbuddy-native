// Ported from the PWA's features/tours/presentation/composables/use-friend-owner-options.ts.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import type { TourFilters } from './use-tour-filters.web';

/** Ids whose phone lookup has settled this session (module-level: outlives the panel). */
const settledIds = new Set<string>();

export interface FilterOption {
  id: string;
  label: string;
}

/**
 * The Friends tab's recorded-by chips (#362): the friends owning the tab's tours, named by the
 * viewer's contact for them, ordered by label. A friend still selected stays offered, so a filter
 * set from a contact detail can be cleared. `settled` gates the chips so their labels render once,
 * final: one batched phone lookup plus the contacts load, failure counting as settled.
 * ponytail: gates the first paint only — a friend tour arriving while the panel is open names its
 * new chip progressively.
 */
export function useFriendOwnerOptions(filters: TourFilters): {
  owners: FilterOption[];
  settled: boolean;
} {
  const { t } = useTranslation('web');
  const friendTours = useToursStore((s) => s.friendTours);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  useContactsStore((s) => s.contacts);
  const contactsLoaded = useContactsStore((s) => s.hasLoaded);

  const owners = [...new Set([...friendTours.map((tour) => tour.userId), ...filters.ownerIds])]
    .map((id) => ({
      id,
      label:
        resolveFriendName(id, phoneMap, (phone) =>
          useContactsStore.getState().findContactByMethodValue('phone', phone),
        ) ?? t('tours.list.aFriend'),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const [phonesSettled, setPhonesSettled] = useState(() =>
    owners.every((o) => settledIds.has(o.id)),
  );
  useEffect(() => {
    const contacts = useContactsStore.getState();
    if (!contacts.hasLoaded && !contacts.isLoading) void contacts.loadContacts();
    if (phonesSettled) return;
    const ids = owners.map((o) => o.id);
    void Promise.resolve(useFriendshipsStore.getState().ensurePhones(ids))
      .catch(() => {})
      .then(() => {
        ids.forEach((id) => settledIds.add(id));
        setPhonesSettled(true);
      });
  }, []);

  return { owners, settled: phonesSettled && contactsLoaded };
}
