import type { z } from 'zod';
import type { userProfileSchema } from '@/features/user/data/models/user-profile-schema';

/** Domain entity for a user profile. */
export type UserProfile = z.infer<typeof userProfileSchema>;

/** Returns true when all required profile fields are filled. */
export function isProfileComplete(profile: Pick<UserProfile, 'firstName' | 'lastName'>): boolean {
  return profile.firstName !== null && profile.lastName !== null;
}
