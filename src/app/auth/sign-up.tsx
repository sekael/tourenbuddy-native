import { useLocalSearchParams } from 'expo-router';

import { SignUpScreen } from '@/features/auth/presentation/sign-up-screen';

/** `/auth/sign-up?email=…`, the address typed on sign-in carried over. */
export default function SignUpRoute() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  return <SignUpScreen initialEmail={email} />;
}
