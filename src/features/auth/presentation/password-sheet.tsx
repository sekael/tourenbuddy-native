import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/core/adaptive/button';
import { Sheet } from '@/core/adaptive/sheet';
import { Text } from '@/core/adaptive/text';
import { TextField } from '@/core/adaptive/text-field';
import { createLogger } from '@/core/logging/logger';
import { color, space } from '@/core/theme/tokens';

import { PASSWORD_MIN_LENGTH, PASSWORD_RULES } from '../domain/credentials';
import { passwordErrorMessage } from './auth-errors';
import { useAuthStore } from './stores/auth-store';

const log = createLogger('PasswordSheet');

/**
 * Sets the account's password: a first one for an account that signed in with codes, a new one
 * after a forgotten one (sign in with a code, then here). Supabase does not say whether a password
 * exists, so it is "set" either way. Closing on success lets iOS offer to save it.
 */
export function PasswordSheet() {
  const { t } = useTranslation();
  const email = useAuthStore((state) => state.user?.email ?? '');
  const setPassword = useAuthStore((state) => state.setPassword);
  const [password, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A ref, not state: a second tap in the same frame must already see the first request.
  const inFlight = useRef(false);

  async function save() {
    if (inFlight.current) return;
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t('auth.password.tooShort', { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await setPassword(password);
      router.back();
    } catch (err) {
      log.warn('Setting the password failed', err);
      setError(passwordErrorMessage(err, t));
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
          onSubmitEditing={save}
        />
        {error && (
          <Text role="alert" variant="caption" style={styles.error}>
            {error}
          </Text>
        )}
        <Button
          label={saving ? t('auth.password.savingBtn') : t('auth.password.saveBtn')}
          onPress={save}
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
