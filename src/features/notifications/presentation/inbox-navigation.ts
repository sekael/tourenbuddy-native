import { router } from 'expo-router';
import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { todayKey } from '@/features/calendar/domain/calendar-dates';
import type { InboxNotification } from '@/features/notifications/domain/entities/inbox-notification';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import { useInboxStore } from './stores/inbox-store';

/** The tour an entry opens. A collision names the actor's tour; it opens the recipient's own. */
export function targetTourId(entry: InboxNotification): string | null {
  const own = entry.ref.other_tour_id;
  return entry.action === 'collision' && typeof own === 'string' ? own : entry.tourId;
}

/** Tours the user may open: their own and those they are a partner on. */
export function canOpenTour(tourId: string): boolean {
  const { tours, friendTours } = useToursStore.getState();
  return (
    tours.some((t) => t.id === tourId) || friendTours.some((t) => t.id === tourId && t.isPartner)
  );
}

/**
 * Where an entry leads (notification-inbox D7: acting happens on the subject), shared by a tap in
 * the inbox and a tapped push: the calendar for a weekly summary, friend requests or the contacts
 * for a friend request, the overlaps for a backfill, else the tour, if the user may still open it.
 */
export async function openInboxEntry(entry: InboxNotification, t: TFunction) {
  if (entry.action === 'weekly') {
    const today = todayKey();
    const dates = Array.isArray(entry.ref.dates) ? entry.ref.dates : [];
    const day = dates
      .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .find((d) => d >= today);
    router.navigate(day ? { pathname: '/calendar', params: { day } } : '/calendar');
    return;
  }
  if (entry.action === 'received') {
    router.navigate({ pathname: '/contacts', params: { open: 'requests' } });
    return;
  }
  if (entry.action === 'responded') {
    router.navigate('/contacts');
    return;
  }
  if (entry.action === 'backfill' && typeof entry.ref.friendship_id === 'string') {
    router.push({ pathname: '/tour-overlaps', params: { friendshipId: entry.ref.friendship_id } });
    return;
  }
  const tourId = targetTourId(entry);
  if (!tourId || entry.action === 'deleted') {
    Alert.alert(t('inbox.unavailable'));
    return;
  }
  // The server's answer, not the store's: the list may predate a lost share.
  await useToursStore.getState().loadFriendTours();
  if (canOpenTour(tourId)) router.push({ pathname: '/tour/[id]', params: { id: tourId } });
  else Alert.alert(t('inbox.unavailable'));
}

/** A push or email link (`…?notification=<id>`): read, then open its subject. */
export async function openNotificationLink(id: string, t: TFunction) {
  const entry = await useInboxStore.getState().find(id);
  if (!entry) {
    Alert.alert(t('inbox.unavailable'));
    return;
  }
  void useInboxStore.getState().markRead(entry.id);
  await openInboxEntry(entry, t);
}
