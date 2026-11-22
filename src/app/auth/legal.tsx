import { router, useLocalSearchParams } from 'expo-router';

import { AboutPage } from '@/features/user/presentation/about-pages';

/** The terms or the privacy policy before an account exists (sign-up's links), closed back to it. */
export default function LegalRoute() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return (
    <AboutPage name={name === 'privacy' ? 'privacy' : 'terms'} onClose={() => router.back()} />
  );
}
