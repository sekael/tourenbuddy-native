import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/core/adaptive/button';
import { Text } from '@/core/adaptive/text';
import { TextField, type TextFieldHandle } from '@/core/adaptive/text-field';
import { createLogger } from '@/core/logging/logger';
import { color } from '@/core/theme/tokens';

import { isEmail, PASSWORD_MIN_LENGTH, PASSWORD_RULES } from '../domain/credentials';
import { AuthHero } from './auth-hero';
import { sendErrorMessage } from './auth-errors';
import { useAuthStore } from './stores/auth-store';

const log = createLogger('SignUp');

/**
 * Create account: an email and a new password (iOS suggests a strong one and offers to save the
 * pair). The email code comes first, for a new address and an existing account alike, so the
 * screen never tells whether the address has an account; the password follows once the code is
 * verified (`verifyOtp`).
 */
export function SignUpScreen({ initialEmail = '' }: { initialEmail?: string }) {
  const { t } = useTranslation();
  const signUp = useAuthStore((state) => state.signUp);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A ref, not state: a second tap in the same frame must already see the first request.
  const inFlight = useRef(false);
  const passwordField = useRef<TextFieldHandle>(null);

  async function create() {
    if (inFlight.current) return;
    const address = email.trim();
    setError(null);
    if (!isEmail(address)) {
      setError(t('auth.emailEntry.invalidEmail'));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t('auth.password.tooShort', { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    inFlight.current = true;
    setSending(true);
    try {
      await signUp(address, password);
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
    <AuthHero title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')}>
      <TextField
        label={t('auth.emailEntry.emailLabel')}
        placeholder={t('auth.emailEntry.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        textContentType="username"
        autoComplete="username"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordField.current?.focus()}
      />
      <TextField
        ref={passwordField}
        label={t('auth.password.newLabel')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        passwordRules={PASSWORD_RULES}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={create}
      />
      {error && (
        <Text role="alert" variant="caption" style={styles.error}>
          {error}
        </Text>
      )}
      <Button
        label={sending ? t('auth.shared.sendingBtn') : t('auth.signUp.createBtn')}
        onPress={create}
        disabled={sending}
      />
    </AuthHero>
  );
}

const styles = StyleSheet.create({ error: { color: color.error } });
