import type { InboxNotification } from '../entities/inbox-notification';

export interface InboxRepository {
  /** Newest-first page; `before` is the keyset cursor (an entry's `createdAt`). */
  listPage: (before: string | null, limit: number) => Promise<InboxNotification[]>;
  /** Every unread entry up to `limit` — the badge must count beyond the first page. */
  listUnread: (limit: number) => Promise<InboxNotification[]>;
  getById: (id: string) => Promise<InboxNotification | null>;
  markRead: (id: string) => Promise<void>;
  /** Marks unread entries created at or before `cutoff` — later arrivals stay unread. */
  markAllRead: (cutoff: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Deletes every entry created at or before `cutoff` — later arrivals stay. */
  removeAll: (cutoff: string) => Promise<void>;
  /** Records the caller's entry for a release note, once per user; true if one was created. */
  recordReleaseNote: (noteId: string, since: string) => Promise<boolean>;
}
