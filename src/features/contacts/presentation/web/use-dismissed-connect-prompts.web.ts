import { useState } from 'react';

import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';

const storageKey = (userId: string) => `tb_dismissed_connect_${userId}`;

function load(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Per-contact decisions not to send a friend request (the PWA's key, so they carry over). Keyed by
 * contact id, so deleting and re-adding a contact resets it.
 */
export function useDismissedConnectPrompts() {
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const [dismissed, setDismissed] = useState(() => load(userId));
  return {
    isDismissed: (contactId: string) => dismissed.has(contactId),
    dismiss: (contactId: string) => {
      const next = new Set(dismissed).add(contactId);
      setDismissed(next);
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify([...next]));
      } catch {
        // Private mode: the prompt returns next time.
      }
    },
  };
}
