import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';

import { Button } from '@/core/adaptive/button';
import { Text } from '@/core/adaptive/text';
import { sessionTrust } from '@/core/auth/session-trust';
import { color, size, space } from '@/core/theme/tokens';

import { passkeysSupported } from '../data/passkeys';
import { useAuthStore } from './stores/auth-store';

/**
 * The signed-in account, its password and passkeys (sheets), and the way out, on the Profile tab
 * until the profile port. While the session is unverified it says so: the offline bar that carries
 * this in the PWA is not ported yet.
 */
export function AccountSection() {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.user?.email);
  const signOut = useAuthStore((state) => state.signOut);
  const unverified = useStore(sessionTrust, (state) => state.unverified);

  return (
    <View style={styles.section}>
      {unverified && (
        <Text role="status" variant="caption" style={styles.muted}>
          {t('offline.bar.unverified')}
        </Text>
      )}
      {email && <Text style={styles.muted}>{email}</Text>}
      <Button
        variant="secondary"
        label={t('auth.password.entryBtn')}
        onPress={() => router.push('/password')}
      />
      {passkeysSupported && (
        <Button
          variant="secondary"
          label={t('auth.passkey.entryBtn')}
          onPress={() => router.push('/passkeys')}
        />
      )}
      <Button
        variant="secondary"
        label={t('user.profile.signOutBtn')}
        onPress={() => void signOut()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    maxWidth: size.form,
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
  },
  muted: { color: color.onSurfaceVariant, textAlign: 'center' },
});
