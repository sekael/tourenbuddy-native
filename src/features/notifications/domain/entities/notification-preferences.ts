// Each value requires only a TS union entry + i18n keys — no DB migration needed
// (notif_muted_types is a text[] column).
//  - tour_updates:  a shared tour you partner on was created / changed / deleted
//  - tour_interest: a friend is interested in your tour (declined a duplicate save)
//  - tour_suggestions: a partner proposed changes to your tour / your proposal was resolved
//  - availability: weekly summary of friends you share a tour with, free when you are
//  - tour_reminders: one of your (or a partnered friend's) tours is 5 days away
export type NotificationType =
  | 'friend_requests'
  | 'tour_updates'
  | 'tour_interest'
  | 'tour_suggestions'
  | 'availability'
  | 'tour_reminders';

/** Drives the preferences mute list and `notif_muted_types` parsing. */
export const MUTABLE_NOTIFICATION_TYPES: NotificationType[] = [
  'friend_requests',
  'tour_updates',
  'tour_interest',
  'tour_suggestions',
  'availability',
  'tour_reminders',
];

/** Every type an inbox entry can have. Release notes are inbox-only: never pushed, not mutable. */
export type InboxNotificationType = NotificationType | 'release_notes';

export const INBOX_NOTIFICATION_TYPES: InboxNotificationType[] = [
  ...MUTABLE_NOTIFICATION_TYPES,
  'release_notes',
];

/**
 * Account-wide prefs. Push is NOT here: it is a per-device setting derived from this
 * browser's subscription (#148) — see `notificationsStore.pushEnabled`.
 */
export interface NotificationPreferences {
  notifEmailEnabled: boolean;
  notifMutedTypes: NotificationType[];
}
