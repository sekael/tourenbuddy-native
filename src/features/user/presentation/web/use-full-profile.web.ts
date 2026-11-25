import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import type { FullUserProfile } from '@/features/user/domain/entities/full-user-profile';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

/** The PWA's `fullProfile`: the profile row with the auth user's email and phone. */
export function useFullProfile(): FullUserProfile | null {
  const profile = useUserProfileStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  if (!profile || !user) return null;
  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: user.email ?? '',
    phoneNumber: user.phone || null,
    phoneVerified: user.phone_confirmed_at != null,
  };
}
