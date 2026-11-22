import type {
  FriendRequest,
  Friendship,
} from '@/features/friendships/data/models/friendship-schemas';

export interface FriendshipRepository {
  sendRequest: (toUserId: string) => Promise<FriendRequest>;
  accept: (requestId: string) => Promise<void>;
  deny: (requestId: string) => Promise<void>;
  cancel: (requestId: string) => Promise<void>;
  listIncoming: () => Promise<FriendRequest[]>;
  listOutgoing: () => Promise<FriendRequest[]>;
  listFriendships: () => Promise<Friendship[]>;
  findUserByPhone: (phone: string) => Promise<string | null>;
  findUsersByPhones: (phones: string[]) => Promise<{ phone: string; userId: string }[]>;
  findPhonesByUserIds: (userIds: string[]) => Promise<{ userId: string; phone: string }[]>;
  getNamesByUserIds: (
    userIds: string[],
  ) => Promise<{ userId: string; firstName: string | null; lastName: string | null }[]>;
  removeFriendship: (otherUserId: string) => Promise<void>;
}
