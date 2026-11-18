import { newId } from '@/core/files';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  CalendarFeed,
  CalendarFeedErrorCode,
  CalendarFeedRepository,
  CalendarSettings,
} from '@/features/calendar/domain/repositories/calendar-feed-repository';
import { env } from '@/core/env';
import { supabase } from '@/core/supabase';
import {
  calendarFeedRowSchema,
  calendarSettingsRowSchema,
} from '@/features/calendar/data/models/calendar-feed';
import { CalendarFeedError } from '@/features/calendar/domain/repositories/calendar-feed-repository';

/** Postgres failure → domain code. Only the codes the UI can explain; the rest is `unknown`. */
function classify(
  error: PostgrestError,
  onCheckViolation: CalendarFeedErrorCode = 'unknown',
): CalendarFeedError {
  if (error.message.includes('calendar_feed_limit_exceeded'))
    return new CalendarFeedError('limit', error);
  if (error.code === '23505') return new CalendarFeedError('duplicate', error);
  if (error.code === '23514') return new CalendarFeedError(onCheckViolation, error);
  return new CalendarFeedError('unknown', error);
}

const hhmm = (time: string) => time.slice(0, 5);

async function selfId(): Promise<string> {
  // getSession is a local read (no network).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? '';
}

export class SupabaseCalendarFeedRepository implements CalendarFeedRepository {
  async listFeeds(): Promise<CalendarFeed[]> {
    const { data, error } = await supabase
      .from('user_calendar_feeds')
      .select('id, url, label, last_synced_at, last_error')
      .order('created_at', { ascending: true });
    if (error) throw classify(error);

    return (data ?? []).map((raw) => {
      const row = calendarFeedRowSchema.parse(raw);
      // Mask at the boundary: past this point nothing holds the secret path.
      return {
        id: row.id,
        host: new URL(row.url).host,
        label: row.label,
        lastSyncedAt: row.last_synced_at,
        lastError: row.last_error,
      };
    });
  }

  async addFeed(url: string, label: string | null): Promise<void> {
    const { error } = await supabase
      .from('user_calendar_feeds')
      .insert({ user_id: await selfId(), url, label });
    if (error) throw classify(error);
  }

  async removeFeed(id: string): Promise<void> {
    const { error } = await supabase.from('user_calendar_feeds').delete().eq('id', id);
    if (error) throw classify(error);
  }

  async relabelFeed(id: string, label: string | null): Promise<void> {
    const { error } = await supabase.from('user_calendar_feeds').update({ label }).eq('id', id);
    if (error) throw classify(error);
  }

  async getSettings(): Promise<CalendarSettings> {
    const columns = 'core_start, core_end, min_free_minutes, feed_token';
    let { data, error } = await supabase
      .from('user_calendar_settings')
      .select(columns)
      .maybeSingle();
    if (!error && !data) {
      // First visit: create the row so the user has a feed token. Defaults live in the DB.
      ({ data, error } = await supabase
        .from('user_calendar_settings')
        .insert({ user_id: await selfId() })
        .select(columns)
        .single());
    }
    if (error) throw classify(error);

    const row = calendarSettingsRowSchema.parse(data);
    return {
      coreStart: hhmm(row.core_start),
      coreEnd: hhmm(row.core_end),
      minFreeMinutes: row.min_free_minutes,
      feedToken: row.feed_token,
    };
  }

  async updateSettings(settings: Omit<CalendarSettings, 'feedToken'>): Promise<void> {
    const { error } = await supabase
      .from('user_calendar_settings')
      .update({
        core_start: settings.coreStart,
        core_end: settings.coreEnd,
        min_free_minutes: settings.minFreeMinutes,
      })
      .eq('user_id', await selfId());
    if (error) throw classify(error, 'invalid_window');
  }

  async regenerateToken(): Promise<string> {
    // expo-crypto's randomUUID is a CSPRNG v4 — same strength as the DB's gen_random_uuid default.
    const feedToken = newId();
    const { error } = await supabase
      .from('user_calendar_settings')
      .update({ feed_token: feedToken })
      .eq('user_id', await selfId());
    if (error) throw classify(error);
    return feedToken;
  }

  async triggerSync(): Promise<void> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!env.EXPO_PUBLIC_NOTIFY_HOOK_URL || !session) throw new CalendarFeedError('sync_failed');

    let res: Response;
    try {
      res = await fetch(`${env.EXPO_PUBLIC_NOTIFY_HOOK_URL}/calendar/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    } catch (err) {
      throw new CalendarFeedError('sync_failed', err);
    }
    // A per-feed failure is still 200 ({ result: 'failed' }); it surfaces as `lastError` on reload.
    if (!res.ok) throw new CalendarFeedError('sync_failed');
  }
}
