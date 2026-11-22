import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';

import { useFriendshipsStore } from './stores/friendships-store';

/**
 * The name to show for a friend, with a settle-then-render gate (ported from the PWA): render
 * `displayName` only while `isResolved`, a placeholder until then, so the fallback ("a friend") is
 * never swapped for the contact's name a moment later. `isResolved` means "no better answer is
 * coming": a failed lookup settles too, or an offline cold start would wait forever.
 */
export function useFriendDisplayName(userId: string | null): {
  displayName: string | null;
  isResolved: boolean;
} {
  const { t } = useTranslation();
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const contacts = useContactsStore((s) => s.contacts);
  const contactsLoaded = useContactsStore((s) => s.hasLoaded);
  const [settledFor, setSettledFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
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
  const name = resolveFriendName(userId, phoneMap, (phone) =>
    contacts.length
      ? useContactsStore.getState().findContactByMethodValue('phone', phone)
      : undefined,
  );
  return {
    displayName: name ?? t('tours.list.aFriend'),
    isResolved: settledFor === userId && contactsLoaded,
  };
}
