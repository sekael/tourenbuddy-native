import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/core/adaptive/button';
import { Text } from '@/core/adaptive/text';
import { TextField, type TextFieldHandle } from '@/core/adaptive/text-field';
import { createLogger } from '@/core/logging/logger';
import { color } from '@/core/theme/tokens';

import { passkeysSupported } from '../data/passkeys';
import { isEmail } from '../domain/credentials';
import { AuthHero } from './auth-hero';
import { passkeyErrorMessage, sendErrorMessage, signInErrorMessage } from './auth-errors';
import { useAuthStore } from './stores/auth-store';

const log = createLogger('SignIn');

type Way = 'password' | 'code' | 'passkey';

/**
 * The first signed-out screen. The email and the password form one pair for AutoFill, which fills
 * and saves both. The ways in: the password; an email code (the PWA's flow, and the way in without
 * a password or after forgetting it); a passkey with Face ID (iOS); or creating an account.
 */
export function SignInScreen() {
  const { t } = useTranslation();
  const sendEmailOtp = useAuthStore((state) => state.sendEmailOtp);
  const signInWithPassword = useAuthStore((state) => state.signInWithPassword);
  const signInWithPasskey = useAuthStore((state) => state.signInWithPasskey);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<Way | null>(null);
  // A ref, not state: a second tap in the same frame must already see the first request.
  const inFlight = useRef(false);
  const passwordField = useRef<TextFieldHandle>(null);

  async function run(
    way: Way,
    request: () => Promise<void>,
    explain: (err: unknown) => string | null,
  ) {
    inFlight.current = true;
    setRunning(way);
    try {
      await request();
    } catch (err) {
      log.warn(`Signing in (${way}) failed`, err);
      setError(explain(err));
    } finally {
      inFlight.current = false;
      setRunning(null);
    }
  }

  /** The typed address, or null after saying it is not one. */
  function address() {
    // Autofill and paste can bring whitespace along; a browser's email field drops it too.
    const value = email.trim();
    if (isEmail(value)) return value;
    setError(t('auth.emailEntry.invalidEmail'));
    return null;
  }

  function signIn() {
    if (inFlight.current) return;
    setError(null);
    const value = address();
    if (!value) return;
    if (!password) {
      setError(t('auth.signIn.passwordRequired'));
      return;
    }
    void run(
      'password',
      () => signInWithPassword(value, password),
      (err) => signInErrorMessage(err, t),
    );
  }

  function sendCode() {
    if (inFlight.current) return;
    setError(null);
    const value = address();
    if (!value) return;
    void run(
      'code',
      async () => {
        await sendEmailOtp(value);
        router.push({ pathname: '/auth/verify-otp', params: { email: value } });
      },
      (err) => sendErrorMessage(err, t),
    );
  }

  function signInWithKey() {
    if (inFlight.current) return;
    setError(null);
    void run('passkey', signInWithPasskey, (err) => passkeyErrorMessage(err, t));
  }

  return (
    <AuthHero title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')}>
      <TextField
        label={t('auth.emailEntry.emailLabel')}
        placeholder={t('auth.emailEntry.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        // The account's name, so AutoFill pairs it with the password (an email address keyboard).
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
        label={t('auth.signIn.passwordLabel')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={signIn}
      />
      {error && (
        <Text role="alert" variant="caption" style={styles.error}>
          {error}
        </Text>
      )}
      <Button
        label={running === 'password' ? t('auth.signIn.signingInBtn') : t('auth.signIn.signInBtn')}
        onPress={signIn}
        disabled={running !== null}
      />
      <Button
        variant="secondary"
        label={running === 'code' ? t('auth.shared.sendingBtn') : t('auth.signIn.emailCodeBtn')}
        onPress={sendCode}
        disabled={running !== null}
      />
      {passkeysSupported && (
        <Button
          variant="secondary"
          label={
            running === 'passkey' ? t('auth.signIn.signingInBtn') : t('auth.signIn.passkeyBtn')
          }
          onPress={signInWithKey}
          disabled={running !== null}
        />
      )}
      <Button
        variant="plain"
        label={t('auth.signIn.createAccountBtn')}
        onPress={() => router.push({ pathname: '/auth/sign-up', params: { email: email.trim() } })}
        disabled={running !== null}
      />
    </AuthHero>
  );
}

const styles = StyleSheet.create({ error: { color: color.error } });
