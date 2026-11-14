import type { InboxNotificationType } from './notification-preferences';

/**
 * One inbox entry — a row of the `notifications` event log (change: notification-inbox,
 * D1). Names are snapshots taken when the event happened; `occurrences` counts collapsed
 * unread repeats of the same edit/collision.
 */
export interface InboxNotification {
  id: string;
  type: InboxNotificationType;
  action: string;
  actorId: string | null;
  actorName: string | null;
  tourId: string | null;
  tourName: string | null;
  ref: Record<string, unknown>;
  occurrences: number;
  readAt: string | null;
  createdAt: string;
}

/** Why an entry no longer needs attention (D7): drives the muted look + reason chip. */
export type InboxStaleReason = 'answered' | 'resolved' | 'tourGone';
