import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';

/**
 * The PWA's `useFriendDisplayName`: the name to show for a friend, rendered once in its final
 * form. Render `displayName` only while `isResolved` (a skeleton until then); a failed lookup
 * settles too, or an offline cold start would shimmer forever.
 */
export function useFriendDisplayName(userId: string | null): {
  displayName: string | null;
  isResolved: boolean;
} {
  const { t } = useTranslation('web');
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const contacts = useContactsStore((s) => s.contacts);
  const contactsLoaded = useContactsStore((s) => s.hasLoaded);
  const [settledFor, setSettledFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    // Not every host page loads contacts (the gate would never settle there).
    const contactsState = useContactsStore.getState();
    if (!contactsState.hasLoaded && !contactsState.isLoading) void contactsState.loadContacts();
    void Promise.resolve(useFriendshipsStore.getState().ensurePhones([userId]))
      .catch(() => {})
      .then(() => {
        if (alive) setSettledFor(userId);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!userId) return { displayName: null, isResolved: true };
  void contacts; // re-render on contact changes: the lookup below reads the store
  const name = resolveFriendName(userId, phoneMap, (phone) =>
    useContactsStore.getState().findContactByMethodValue('phone', phone),
  );
  return {
    displayName: name ?? t('tours.list.aFriend'),
    isResolved: settledFor === userId && contactsLoaded,
  };
}
