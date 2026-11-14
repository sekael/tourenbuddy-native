import type { UserBlock } from '@/features/friendships/data/models/user-block-schemas';

export interface BlockedUserInfo {
  userId: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface UserBlockRepository {
  listActive: () => Promise<UserBlock[]>;
  listBlockedUsers: () => Promise<BlockedUserInfo[]>;
  block: (targetUserId: string) => Promise<void>;
  unblock: (targetUserId: string) => Promise<void>;
  isBlockedBy: (targetUserId: string) => Promise<boolean>;
  report: (targetUserId: string, reason: string | null) => Promise<void>;
}
