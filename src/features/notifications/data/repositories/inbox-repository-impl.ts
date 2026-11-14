import type { InboxNotification } from '../../domain/entities/inbox-notification';
import type { InboxRepository } from '../../domain/repositories/inbox-repository';
import { supabase } from '@/core/supabase';
import { INBOX_COLUMNS, parseInboxRows } from '../models/inbox-schemas';

// RLS scopes every query to `recipient_id = auth.uid()`; no user filter is needed here.
export class InboxRepositoryImpl implements InboxRepository {
  async listPage(before: string | null, limit: number): Promise<InboxNotification[]> {
    let query = supabase
      .from('notifications')
      .select(INBOX_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return parseInboxRows(data ?? []);
  }

  async listUnread(limit: number): Promise<InboxNotification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select(INBOX_COLUMNS)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return parseInboxRows(data ?? []);
  }

  async getById(id: string): Promise<InboxNotification | null> {
    const { data, error } = await supabase
      .from('notifications')
      .select(INBOX_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? (parseInboxRows([data])[0] ?? null) : null;
  }

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null);
    if (error) throw new Error(error.message);
  }

  async markAllRead(cutoff: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .lte('created_at', cutoff);
    if (error) throw new Error(error.message);
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async removeAll(cutoff: string): Promise<void> {
    // RLS scopes the delete to the caller's own rows.
    const { error } = await supabase.from('notifications').delete().lte('created_at', cutoff);
    if (error) throw new Error(error.message);
  }

  async recordReleaseNote(noteId: string, since: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('record_release_note', {
      p_note_id: noteId,
      p_since: since,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }
}
