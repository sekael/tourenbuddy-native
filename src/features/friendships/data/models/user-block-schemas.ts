import { z } from 'zod';

export const userBlockSchema = z.object({
  blockerUserId: z.string().guid(),
  blockedUserId: z.string().guid(),
  firstBlockedAt: z.string(),
  lastBlockedAt: z.string(),
  unblockedAt: z.string().nullable(),
});

export type UserBlock = z.infer<typeof userBlockSchema>;
