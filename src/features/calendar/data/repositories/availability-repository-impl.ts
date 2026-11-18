import type { AvailabilityRow } from '@/features/calendar/data/models/availability';
import type { AvailabilityRepository } from '@/features/calendar/domain/repositories/availability-repository';
import { supabase } from '@/core/supabase';
import { availabilityRowSchema } from '@/features/calendar/data/models/availability';

export class SupabaseAvailabilityRepository implements AvailabilityRepository {
  async listOwnFrom(fromDate: string): Promise<string[]> {
    // Filter to own rows explicitly. #244's friend-SELECT RLS makes friends' rows
    // readable too, so relying on RLS alone would fold friend availability into the
    // owner's green overlay. getSession is a local read (no network).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const selfId = session?.user.id ?? '';

    const { data, error } = await supabase
      .from('user_availability')
      .select('user_id, date')
      .eq('user_id', selfId)
      // Owner policy returns own tombstones (available = false); friends' are hidden by RLS.
      .eq('available', true)
      .gte('date', fromDate)
      .order('date', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => availabilityRowSchema.parse(row).date);
  }

  async listFriendsFrom(fromDate: string): Promise<AvailabilityRow[]> {
    // getSession is a local read (no network) — used to exclude own rows, since the
    // own + friend SELECT policies both return rows and PostgREST can't reference
    // auth.uid() in a filter. Friend-SELECT RLS scopes the remainder to friends.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const selfId = session?.user.id ?? '';

    const { data, error } = await supabase
      .from('user_availability')
      .select('user_id, date')
      .gte('date', fromDate)
      .neq('user_id', selfId)
      .order('date', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => availabilityRowSchema.parse(row));
  }

  async applyDiff(added: string[], removed: string[]): Promise<void> {
    // Single transactional RPC — never two separate insert/delete calls, which
    // could leave availability half-applied. RLS still gates writes to auth.uid().
    const { error } = await supabase.rpc('apply_availability_diff', { added, removed });

    if (error) throw new Error(error.message);
  }
}
