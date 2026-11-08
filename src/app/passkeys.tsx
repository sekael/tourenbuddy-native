import { Redirect } from 'expo-router';

import { passkeysSupported } from '@/features/auth/data/passkeys';
import { PasskeysSheet } from '@/features/auth/presentation/passkeys-sheet';

/** iOS only; elsewhere the address leads back to Profile. */
export default function PasskeysRoute() {
  return passkeysSupported ? <PasskeysSheet /> : <Redirect href="/profile" />;
}
