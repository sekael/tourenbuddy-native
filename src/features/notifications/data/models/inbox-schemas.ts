import type { InboxNotification } from '../../domain/entities/inbox-notification';
import { z } from 'zod';
import { INBOX_NOTIFICATION_TYPES } from '../../domain/entities/notification-preferences';

export const INBOX_COLUMNS =
  'id, type, action, actor_id, actor_name, tour_id, tour_name, ref, occurrences, read_at, created_at';

export const inboxNotificationRowSchema = z
  .object({
    id: z.string().guid(),
    // Unknown types are rejected (not rendered generically): the type picks the icon,
    // mute group and deep-link family, none of which exist for a type this build lacks.
    type: z.enum(INBOX_NOTIFICATION_TYPES as [string, ...string[]]),
    action: z.string().min(1),
    actor_id: z.string().guid().nullable(),
    actor_name: z.string().nullable(),
    tour_id: z.string().guid().nullable(),
    tour_name: z.string().nullable(),
    ref: z.record(z.string(), z.unknown()),
    occurrences: z.number().int().positive(),
    read_at: z.string().nullable(),
    created_at: z.string(),
  })
  .transform((row): InboxNotification => ({
    id: row.id,
    type: row.type as InboxNotification['type'],
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name,
    tourId: row.tour_id,
    tourName: row.tour_name,
    ref: row.ref,
    occurrences: row.occurrences,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));

/** Parse a result set, dropping (not throwing on) rows this build can't render. */
export function parseInboxRows(rows: unknown[]): InboxNotification[] {
  return rows.flatMap((r) => {
    const parsed = inboxNotificationRowSchema.safeParse(r);
    return parsed.success ? [parsed.data] : [];
  });
}
