import { useEffect, useMemo } from 'react';

import { normalizePhone } from '@/core/utils/phone-normalize';
import type { Contact } from '@/features/contacts/domain/entities/contact';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';

/** A phone as the directory keys it: E.164 when it parses, else as typed. */
export const phoneKey = (value: string) => {
  const normalized = normalizePhone(value);
  return normalized.ok ? normalized.e164 : value;
};

export const contactPhones = (contact: Contact) =>
  contact.contactMethods.filter((m) => m.methodType === 'phone').map((m) => phoneKey(m.value));

/**
 * Who each contact is on TourenBuddy (friendships, user-blocks): the friend it links to, matched
 * through the friends' phone directory, and whether the user blocks it (its friend or any of its
 * phones). Asks the directory for the friends' phones it does not know yet.
 */
export function useContactLinks() {
  const friendIds = useFriendshipsStore((s) => s.friendUserIds);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const blockedIds = useUserBlocksStore((s) => s.blockedUserIds);
  const blockedPhones = useUserBlocksStore((s) => s.blockedPhones);

  useEffect(() => {
    if (friendIds.size) void useFriendshipsStore.getState().ensurePhones([...friendIds]);
  }, [friendIds]);

  return useMemo(() => {
    const friendByPhone = new Map<string, string>();
    for (const [id, phone] of phoneMap) {
      if (friendIds.has(id)) friendByPhone.set(phoneKey(phone), id);
    }
    const friendOf = (contact: Contact): string | null =>
      contactPhones(contact)
        .map((p) => friendByPhone.get(p))
        .find((id): id is string => !!id) ?? null;
    const isBlocked = (contact: Contact) => {
      const friend = friendOf(contact);
      return (
        (!!friend && blockedIds.has(friend)) ||
        contactPhones(contact).some((p) => blockedPhones.has(p))
      );
    };
    return { friendOf, isBlocked };
  }, [friendIds, phoneMap, blockedIds, blockedPhones]);
}
