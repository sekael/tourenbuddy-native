import { useEffect, useRef, useState } from 'react';

import { normalizePhone } from '@/core/utils/phone-normalize';
import type { Contact } from '@/features/contacts/domain/entities/contact';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';

/**
 * The phone → user id directory for the contacts' numbers (the PWA's `useContactFriendshipMap`):
 * asks for the numbers it does not know yet, once the caller's phone is verified.
 */
export function usePhoneDirectory(contacts: Contact[], verified: boolean) {
  const [map, setMap] = useState(() => new Map<string, string>());
  const known = useRef(map);
  known.current = map;
  useEffect(() => {
    if (!verified || contacts.length === 0) return;
    const unknown = new Set<string>();
    for (const contact of contacts)
      for (const m of contact.contactMethods) {
        if (m.methodType !== 'phone') continue;
        const norm = normalizePhone(m.value);
        if (norm.ok && !known.current.has(norm.e164)) unknown.add(norm.e164);
      }
    if (unknown.size === 0) return;
    void useFriendshipsStore
      .getState()
      .findUsersByPhones([...unknown])
      .then((matches) => {
        if (!matches.length) return;
        setMap((prev) => {
          const next = new Map(prev);
          for (const m of matches) next.set(m.phone, m.userId);
          return next;
        });
      });
  }, [contacts, verified]);
  return [map, setMap] as const;
}
