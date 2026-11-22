import i18n from '@/core/i18n';
import { supabase } from '@/core/supabase';
import type { UserProfile } from '@/features/user/domain/entities/user-profile';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

// The app's language (iOS: per app, in Settings) reaches the profile and the session's metadata,
// where the Worker and the email-code hook read it, as the PWA's language switch writes them.
const profile = (locale: UserProfile['locale']) => ({ id: 'u1', locale }) as UserProfile;
const setLocale = jest.fn(async (_: string) => {});

beforeEach(async () => {
  jest.clearAllMocks();
  useUserProfileStore.setState({ profile: null, setLocale });
  await i18n.changeLanguage('de-CH');
});

it('should write the language into a profile that still has another', () => {
  useUserProfileStore.setState({ profile: profile('en') });

  expect(setLocale).toHaveBeenCalledWith('de-CH');
  expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { locale: 'de' } });
});

it('should write nothing while the profile already has it', () => {
  useUserProfileStore.setState({ profile: profile('de-CH') });

  expect(setLocale).not.toHaveBeenCalled();
  expect(supabase.auth.updateUser).not.toHaveBeenCalled();
});

it('should follow a language changed while the app runs', async () => {
  useUserProfileStore.setState({ profile: profile('de-CH') });

  await i18n.changeLanguage('en');

  expect(setLocale).toHaveBeenCalledWith('en');
  expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { locale: 'en' } });
});
