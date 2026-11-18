import { z } from 'zod';

export const friendRequestSchema = z.object({
  id: z.string().guid(),
  fromUserId: z.string().guid(),
  toUserId: z.string().guid(),
  status: z.enum(['pending', 'accepted', 'denied', 'cancelled']),
  createdAt: z.string(),
  respondedAt: z.string().nullable(),
});

export const friendshipSchema = z.object({
  requestUserId: z.string().guid(),
  responseUserId: z.string().guid(),
  createdAt: z.string(),
  requestId: z.string().guid().nullable(),
});

export type FriendRequest = z.infer<typeof friendRequestSchema>;
export type Friendship = z.infer<typeof friendshipSchema>;
