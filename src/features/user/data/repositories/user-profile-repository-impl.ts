import type { UserProfile } from '@/features/user/domain/entities/user-profile';
import type { UserProfileRepository } from '@/features/user/domain/repositories/user-profile-repository';
import { env } from '@/core/env';
import { UnauthorizedUserException } from '@/core/exceptions';
import { supabase } from '@/core/supabase';
import { userProfileRowSchema } from '@/features/user/data/models/user-profile-schema';

export class UserProfileRepositoryImpl implements UserProfileRepository {
  async getUserById(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('user_profile')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return userProfileRowSchema.parse(data);
  }

  async upsertProfile(profile: UserProfile): Promise<UserProfile> {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData.session?.user.id;

    if (currentUserId !== profile.id) {
      throw new UnauthorizedUserException();
    }

    const { data, error } = await supabase
      .from('user_profile')
      .upsert({
        id: profile.id,
        first_name: profile.firstName,
        last_name: profile.lastName,
        locale: profile.locale,
        onboarding_tour_show_at_sign_in: profile.onboardingTourShowAtSignIn,
        onboarding_tour_last_step: profile.onboardingTourLastStep,
        calendar_tour_show_on_first_open: profile.calendarTourShowOnFirstOpen,
        calendar_feature_notice_show_at_sign_in: profile.calendarFeatureNoticeShowAtSignIn,
        pace: profile.pace,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return userProfileRowSchema.parse(data);
  }

  async getProfileUpdatedAt(id: string): Promise<string | null> {
    // maybeSingle → null (not an error) when the row is gone; RLS scopes to the owner.
    const { data, error } = await supabase
      .from('user_profile')
      .select('updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return data?.updated_at ?? null;
  }

  async deleteAccount(): Promise<void> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!env.EXPO_PUBLIC_NOTIFY_HOOK_URL || !session)
      throw new Error('account deletion unavailable');
    // The Worker deletes the files, then the auth user; every row cascades (design D5).
    const res = await fetch(`${env.EXPO_PUBLIC_NOTIFY_HOOK_URL}/account/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) throw new Error(`account deletion failed: ${res.status}`);
  }
}
