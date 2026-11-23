import { router, useGlobalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useSnackbar } from '@/core/web/use-snackbar.web';
import { todayKey } from '@/features/calendar/domain/calendar-dates';
import type { InboxNotification } from '@/features/notifications/domain/entities/inbox-notification';
import { canOpenTour, targetTourId } from '@/features/notifications/presentation/inbox-navigation';
import { useInboxStore } from '@/features/notifications/presentation/stores/inbox-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

/**
 * Where an inbox entry leads (entries are static, acting happens on the subject), shared by a tap
 * in the inbox and the `?notification=<id>` link every push and email carries.
 */
export function useInboxNavigation(open: {
  overlay: (name: 'friend-requests' | 'contacts') => void;
  tour: (tourId: string) => void;
}) {
  const { t } = useTranslation('web');
  const snackbar = useSnackbar();
  const { notification } = useGlobalSearchParams<{ notification?: string }>();

  // The calendar on the summary's first listed day that isn't past (the local date).
  function openSummary(entry: InboxNotification) {
    const dates = Array.isArray(entry.ref.dates) ? entry.ref.dates : [];
    const today = todayKey();
    const day = dates
      .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .find((d) => d >= today);
    router.push(day ? { pathname: '/calendar', params: { day } } : '/calendar');
  }

  async function openEntry(entry: InboxNotification) {
    if (entry.action === 'weekly') {
      openSummary(entry);
      return;
    }
    if (entry.action === 'received') {
      open.overlay('friend-requests');
      return;
    }
    if (entry.action === 'responded') {
      open.overlay('contacts');
      return;
    }
    const friendshipId = entry.ref.friendship_id;
    if (entry.action === 'backfill' && typeof friendshipId === 'string') {
      router.push({
        pathname: '/friends/[friendshipId]/backfill-collisions',
        params: { friendshipId },
      });
      return;
    }
    const tourId = targetTourId(entry);
    if (!tourId || entry.action === 'deleted') {
      snackbar.show(t('inbox.unavailable'));
      return;
    }
    // Decide on the server's answer, not the store: the list may be an offline paint from before
    // the recipient lost access.
    await useToursStore.getState().loadFriendTours();
    if (canOpenTour(tourId)) open.tour(tourId);
    else snackbar.show(t('inbox.unavailable'));
  }

  // Push and email link: mark read, open the subject, drop the parameter so a reload doesn't
  // open it again.
  useEffect(() => {
    if (typeof notification !== 'string' || !notification) return;
    router.setParams({ notification: undefined });
    void (async () => {
      const entry = await useInboxStore.getState().find(notification);
      if (!entry) {
        snackbar.show(t('inbox.unavailable'));
        return;
      }
      void useInboxStore.getState().markRead(entry.id);
      await openEntry(entry);
    })();
  }, [notification]);

  return { openEntry, snackbar };
}
