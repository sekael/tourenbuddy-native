import type { UserBlock } from '@/features/friendships/data/models/user-block-schemas';
import type {
  BlockedUserInfo,
  UserBlockRepository,
} from '@/features/friendships/domain/repositories/user-block-repository';
import { BlockAlreadyExistsError, BlockCooldownError, NotBlockedError } from '@/core/exceptions';
import { supabase } from '@/core/supabase';
import { userBlockSchema } from '@/features/friendships/data/models/user-block-schemas';

function mapBlock(row: Record<string, unknown>): UserBlock {
  return userBlockSchema.parse({
    blockerUserId: row.blocker_user_id,
    blockedUserId: row.blocked_user_id,
    firstBlockedAt: row.first_blocked_at,
    lastBlockedAt: row.last_blocked_at,
    unblockedAt: row.unblocked_at ?? null,
  });
}

function mapRpcError(message: string, detail?: string | null): Error {
  if (message === 'already_blocked') return new BlockAlreadyExistsError();
  if (message === 'not_blocked') return new NotBlockedError();
  if (message === 'cooldown_active') {
    const seconds = detail ? Number.parseFloat(detail) : 0;
    return new BlockCooldownError(Number.isFinite(seconds) ? seconds : 0);
  }
  return new Error(message);
}

export class UserBlockRepositoryImpl implements UserBlockRepository {
  async listBlockedUsers(): Promise<BlockedUserInfo[]> {
    const { data, error } = await supabase.rpc('list_blocked_users');
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      userId: r.user_id as string,
      phone: (r.phone as string | null) ?? null,
      firstName: (r.first_name as string | null) ?? null,
      lastName: (r.last_name as string | null) ?? null,
    }));
  }

  async listActive(): Promise<UserBlock[]> {
    const { data, error } = await supabase
      .from('user_blocks')
      .select()
      .is('unblocked_at', null)
      .order('last_blocked_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>[]).map(mapBlock);
  }

  async block(targetUserId: string): Promise<void> {
    const { error } = await supabase.rpc('block_user', { target: targetUserId });
    if (error) throw mapRpcError(error.message, error.details);
  }

  async unblock(targetUserId: string): Promise<void> {
    const { error } = await supabase.rpc('unblock_user', { target: targetUserId });
    if (error) throw mapRpcError(error.message, error.details);
  }

  async isBlockedBy(targetUserId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_blocked_by', { target: targetUserId });
    if (error) throw new Error(error.message);
    return data as boolean;
  }

  async report(targetUserId: string, reason: string | null): Promise<void> {
    const { error } = await supabase.rpc('report_user', { target: targetUserId, reason });
    if (error) throw new Error(error.message);
  }
}
