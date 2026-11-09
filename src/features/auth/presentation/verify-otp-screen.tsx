import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';

import { showAlert } from '@/core/adaptive/alert';
import { Button } from '@/core/adaptive/button';
import { Text } from '@/core/adaptive/text';
import { TextField } from '@/core/adaptive/text-field';
import { createLogger } from '@/core/logging/logger';
import { color, fieldType, strong } from '@/core/theme/tokens';

import { AuthHero } from './auth-hero';
import { isOffline, rateLimitWait } from './auth-errors';
import { useAuthStore } from './stores/auth-store';

const log = createLogger('VerifyOtp');

const CODE_LENGTH = 6;

/**
 * Supabase refuses a second code to the same address within 60 s. The code was sent just before
 * this screen opened, so the resend button starts cooling down at once.
 */
export const RESEND_COOLDOWN_S = 60;

/**
 * Second sign-in step: the code from the email, also the one that confirms a new account. Leaving
 * it is the navigation bar's back button or the back gesture; signing in leaves it on its own (the
 * routes follow the session).
 */
export function VerifyOtpScreen({ email }: { email: string }) {
  const { t } = useTranslation();
  const verifyOtp = useAuthStore((state) => state.verifyOtp);
  const resendEmailOtp = useAuthStore((state) => state.resendEmailOtp);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  // A deadline, not a count: iOS pauses timers while the user is in Mail fetching the code, and
  // the server's limit runs on the clock.
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_COOLDOWN_S * 1000);
  const [now, setNow] = useState(Date.now);
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const counting = cooldown > 0;
  // Refs, not state: two changes in one frame (autofill) must already see the first request.
  const inFlight = useRef(false);
  // The last value sent, so autofill repopulating a rejected code never resubmits it unchanged.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!counting) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [counting]);

  function coolDown(seconds: number) {
    const start = Date.now();
    setNow(start);
    setResendAt(start + seconds * 1000);
  }

  async function verify(value: string) {
    if (inFlight.current || value.length < CODE_LENGTH) return;
    inFlight.current = true;
    attempted.current = value;
    setError(null);
    setVerifying(true);
    try {
      // Signed in either way; the user is already on the map when this alert shows.
      if ((await verifyOtp(email, value)) === 'passwordNotSaved') {
        showAlert(t('auth.signUp.passwordNotSavedTitle'), t('auth.signUp.passwordNotSaved'));
      }
    } catch (err) {
      log.warn('Verification failed', err);
      if (isOffline(err)) {
        setError(t('offline.actionUnavailable'));
      } else {
        setError(t('auth.verifyOtp.verifyError'));
        setCode('');
      }
    } finally {
      inFlight.current = false;
      setVerifying(false);
    }
  }

  // Paste, autofill and the QuickType suggestion can bring spaces or a line break along: the same
  // code with formatting, so keep the digits. Six of them submit without a tap.
  function change(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && digits !== attempted.current) void verify(digits);
  }

  async function resend() {
    if (cooldown > 0 || resending) return;
    setError(null);
    setResent(false);
    setResending(true);
    try {
      await resendEmailOtp(email);
      setResent(true);
      coolDown(RESEND_COOLDOWN_S);
      // A new code: even one equal to a rejected code submits on its own again.
      attempted.current = null;
    } catch (err) {
      // Wait out the server's own clock rather than show an error.
      const wait = rateLimitWait(err);
      if (wait) coolDown(wait);
      else setError(t(isOffline(err) ? 'offline.actionUnavailable' : 'auth.verifyOtp.resendError'));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthHero
      title={t('auth.verifyOtp.title')}
      subtitle={
        <>
          {t('auth.verifyOtp.subtitlePrefix')} <Text style={styles.email}>{email}</Text>
        </>
      }
    >
      <TextField
        label={t('auth.verifyOtp.inputLabel')}
        placeholder={t('auth.verifyOtp.inputPlaceholder')}
        value={code}
        onChangeText={change}
        // Offers the code from Mail above the keyboard (iOS); never offered for saving.
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        keyboardType="number-pad"
        autoFocus
        style={styles.code}
      />
      {error && (
        <Text role="alert" variant="caption" style={styles.error}>
          {error}
        </Text>
      )}
      {resent && (
        <Text role="status" variant="caption" style={styles.success}>
          {t('auth.verifyOtp.resendSuccess')}
        </Text>
      )}
      <Button
        label={verifying ? t('auth.shared.sendingBtn') : t('auth.verifyOtp.verifyBtn')}
        onPress={() => void verify(code)}
        disabled={verifying || code.length < CODE_LENGTH}
      />
      <Button
        variant="secondary"
        label={
          cooldown > 0
            ? t('auth.verifyOtp.resendCountdown', { seconds: cooldown })
            : resending
              ? t('auth.shared.sendingBtn')
              : t('auth.verifyOtp.resendBtn')
        }
        onPress={resend}
        disabled={resending || cooldown > 0}
      />
    </AuthHero>
  );
}

const styles = StyleSheet.create({
  email: { color: color.onSurface, ...strong },
  code: { ...fieldType.code, textAlign: 'center' },
  error: { color: color.error },
  success: { color: color.success },
});
