import { findReleaseNote } from '@/features/notifications/data/release-notes';
import type { InboxNotification } from '@/features/notifications/domain/entities/inbox-notification';

/** Every action the DB emits today (design D1). Actions are unique across types. */
export const INBOX_ACTIONS = [
  'received',
  'responded',
  'created',
  'updated',
  'deleted',
  'collision',
  'backfill',
  'link_created',
  'link_declined',
  'group_joined',
  'group_evicted_external',
  'group_dissolved',
  'suggestion_submitted',
  'suggestion_revised',
  'suggestion_resolved',
  'weekly',
  'upcoming',
  'published',
] as const;

const KNOWN = new Set<string>(INBOX_ACTIONS);

/** The friend ids of an availability summary, in the job's order (first is named). */
export function summaryFriendIds(entry: InboxNotification): string[] {
  const ids = entry.ref.friend_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Entries store structure, not prose, so they re-render in the current locale (D1). An
 * action this build doesn't know (a newer DB) falls back to a generic line.
 * `friendName` is the summary's first friend, resolved by the caller (names aren't stored).
 */
export function inboxText(
  entry: InboxNotification,
  t: (key: string, params?: Record<string, unknown>) => string,
  friendName?: string | null,
): string {
  if (entry.action === 'weekly') {
    const more = Math.max(summaryFriendIds(entry).length - 1, 0);
    return t(more > 0 ? 'inbox.entry.weeklyMore' : 'inbox.entry.weekly', {
      actor: friendName || t('inbox.someone'),
      count: more,
    });
  }
  if (entry.action === 'published') {
    const note = findReleaseNote(entry.ref.note_id);
    return note
      ? t('inbox.entry.published', { title: t(`releaseNotes.${note.id}.title`) })
      : t('inbox.entry.publishedUnknown');
  }
  const key = KNOWN.has(entry.action) ? `inbox.entry.${entry.action}` : 'inbox.entry.unknown';
  return t(key, {
    actor: entry.actorName || t('inbox.someone'),
    tour: entry.tourName || t('inbox.aTour'),
    count: typeof entry.ref.count === 'number' ? entry.ref.count : entry.occurrences,
  });
}
