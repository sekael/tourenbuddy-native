import { router, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/core/adaptive/screen';
import { AboutPage } from '@/features/user/presentation/about-pages';

/**
 * The terms or the privacy policy before an account exists (sign-up's links), closed back to it.
 * A page needs its screen around it: on iOS that is the SwiftUI host it draws in (without one the
 * sheet stayed blank).
 */
export default function LegalRoute() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return (
    <Screen>
      <AboutPage name={name === 'privacy' ? 'privacy' : 'terms'} onClose={() => router.back()} />
    </Screen>
  );
}
