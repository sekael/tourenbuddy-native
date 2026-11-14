import type { UserProfile } from '@/features/user/domain/entities/user-profile';

/** Abstract repository interface for user profile data operations. */
export interface UserProfileRepository {
  getUserById: (userId: string) => Promise<UserProfile | null>;
  upsertProfile: (profile: UserProfile) => Promise<UserProfile>;
  /** Current server `updated_at`, or null if the row is gone — the LWW read (DC5). */
  getProfileUpdatedAt: (id: string) => Promise<string | null>;
  /** Deletes the signed-in account with all its data and files (change: add-native-backend). */
  deleteAccount: () => Promise<void>;
}
