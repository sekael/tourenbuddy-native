import { Redirect, useLocalSearchParams } from 'expo-router';

import { VerifyOtpScreen } from '@/features/auth/presentation/verify-otp-screen';

/** `/auth/verify-otp?email=…`; without an email (a stale link, a reload) back to the first step. */
export default function VerifyOtpRoute() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  return email ? <VerifyOtpScreen email={email} /> : <Redirect href="/auth" />;
}
