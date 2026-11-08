import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/core/adaptive/button';
import { Text } from '@/core/adaptive/text';
import { TextField } from '@/core/adaptive/text-field';
import { createLogger } from '@/core/logging/logger';
import { color } from '@/core/theme/tokens';

import { AuthHero } from './auth-hero';
import { sendErrorMessage } from './auth-errors';
import { useAuthStore } from './stores/auth-store';

const log = createLogger('EmailEntry');

// The PWA's check: something@something.tld, no spaces.
const EMAIL = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

/** First sign-in step: the email address the code goes to. */
export function EmailEntryScreen() {
  const { t } = useTranslation();
  const sendEmailOtp = useAuthStore((state) => state.sendEmailOtp);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A ref, not state: a second tap in the same frame must already see the first request.
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;
    // Autofill and paste can bring whitespace along; a browser's email field drops it too.
    const address = email.trim();
    setError(null);
    if (!EMAIL.test(address)) {
      setError(t('auth.emailEntry.invalidEmail'));
      return;
    }
    inFlight.current = true;
    setSending(true);
    try {
      await sendEmailOtp(address);
      router.push({ pathname: '/auth/verify-otp', params: { email: address } });
    } catch (err) {
      log.warn('Sending the code failed', err);
      setError(sendErrorMessage(err, t));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <AuthHero title={t('auth.emailEntry.title')} subtitle={t('auth.emailEntry.subtitle')}>
      <TextField
        label={t('auth.emailEntry.emailLabel')}
        placeholder={t('auth.emailEntry.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        textContentType="emailAddress"
        autoComplete="email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="send"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={submit}
      />
      {error && (
        <Text role="alert" variant="caption" style={styles.error}>
          {error}
        </Text>
      )}
      <Button
        label={sending ? t('auth.shared.sendingBtn') : t('auth.emailEntry.sendCodeBtn')}
        onPress={submit}
        disabled={sending}
      />
    </AuthHero>
  );
}

const styles = StyleSheet.create({ error: { color: color.error } });
