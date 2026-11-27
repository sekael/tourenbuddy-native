import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, View } from 'react-native';

import { Button } from '@/core/adaptive/button';
import { Sheet } from '@/core/adaptive/sheet';
import { Text } from '@/core/adaptive/text';
import { TextField } from '@/core/adaptive/text-field';
import { createLogger } from '@/core/logging/logger';
import { color, space } from '@/core/theme/tokens';

import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from '../domain/credentials';
import { needsPasswordCode, passwordErrorMessage } from './auth-errors';
import { useAuthStore } from './stores/auth-store';

const log = createLogger('PasswordSheet');

/**
 * Sets the account's password: a first one for an account that signed in with codes, a new one
 * after a forgotten one (sign in with a code, then here). Supabase does not say whether a password
 * exists, so it is "set" either way. Closing on success lets iOS offer to save it.
 *
 * A password is a lasting way in, so setting one needs more than an unlocked phone: unless the
 * user signed in in this app a moment ago (a code, password or passkey just proved who they are),
 * a code sent to their email confirms it. The server asks for the same on a session older than a day (Supabase's
 * secure password change), and the sheet follows when it does.
 */
const RECENT_SIGN_IN_MS = 10 * 60 * 1000;
export function PasswordSheet() {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.user?.email ?? '');
  const setPassword = useAuthStore((state) => state.setPassword);
  const sendPasswordCode = useAuthStore((state) => state.sendPasswordCode);
  const provenAt = useAuthStore((state) => state.provenAt);
  const [password, setValue] = useState('');
  /** Null until a code was sent; then the code the user types. */
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second tap in the same frame must already see the first request.
  const inFlight = useRef(false);

  // Read as the sheet opens: whether a sign-in in this app session proved who the user is a moment
  // ago. Not the account's last sign-in time: another device, a re-sign-in elsewhere or a session
  // refresh can make that recent while this phone proved nothing.
  const [recent] = useState(() => !!provenAt && Date.now() - provenAt < RECENT_SIGN_IN_MS);

  async function askForCode() {
    await sendPasswordCode();
    setCode('');
  }

  /** The message shows under the fields: the keyboard goes, or it would cover it. */
  function fail(message: string) {
    setError(message);
    Keyboard.dismiss();
  }

  /** `typed`: the code as it is typed, before its state has caught up (the sixth digit). */
  async function save(typed = code) {
    if (inFlight.current) return;
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      fail(t('auth.password.tooShort', { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (typed !== null && typed.trim().length < 6) {
      fail(t('auth.password.codeMissing'));
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      if (typed === null && !recent) {
        await askForCode();
        return;
      }
      await setPassword(password, typed?.trim() || undefined);
      router.back();
    } catch (err) {
      if (typed === null && needsPasswordCode(err)) {
        try {
          await askForCode();
        } catch (sendError) {
          log.warn('Sending the password code failed', sendError);
          fail(passwordErrorMessage(sendError, t));
        }
        return;
      }
      log.warn('Setting the password failed', err);
      fail(passwordErrorMessage(err, t));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Sheet title={t('auth.password.title')}>
      <View style={styles.body}>
        <Text style={styles.muted}>{t('auth.password.subtitle')}</Text>
        {/* The account the password belongs to: iOS saves the pair. */}
        <TextField
          label={t('auth.emailEntry.emailLabel')}
          value={email}
          editable={false}
          textContentType="username"
          autoComplete="username"
        />
        <TextField
          label={t('auth.password.newLabel')}
          value={password}
          onChangeText={setValue}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          passwordRules={PASSWORD_RULES}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => void save()}
        />
        {code !== null && (
          <>
            <Text style={styles.muted}>{t('auth.password.codeSent', { email })}</Text>
            {/* The sixth digit saves, as the sign-in code does: the number pad has no return key,
                and the keyboard would hide the answer under the button. */}
            <TextField
              label={t('auth.password.codeLabel')}
              value={code}
              onChangeText={(value) => {
                const digits = value.replace(/\D/g, '').slice(0, 6);
                setCode(digits);
                if (digits.length === 6) void save(digits);
              }}
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <Button
              variant="plain"
              label={t('auth.password.codeResend')}
              onPress={() =>
                void askForCode().catch((err: unknown) => fail(passwordErrorMessage(err, t)))
              }
              disabled={saving}
            />
          </>
        )}
        {error && (
          <Text role="alert" variant="caption" style={styles.error}>
            {error}
          </Text>
        )}
        <Button
          label={
            saving
              ? t('auth.password.savingBtn')
              : code === null && !recent
                ? t('auth.password.continueBtn')
                : t('auth.password.saveBtn')
          }
          onPress={() => void save()}
          disabled={saving}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  muted: { color: color.onSurfaceVariant },
  error: { color: color.error },
});
