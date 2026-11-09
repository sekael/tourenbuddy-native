import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/core/adaptive/button';
import { Sheet } from '@/core/adaptive/sheet';
import { Text } from '@/core/adaptive/text';
import { createLogger } from '@/core/logging/logger';
import { color, space } from '@/core/theme/tokens';

import { passkeyErrorMessage } from './auth-errors';
import { type PasskeyItem, useAuthStore } from './stores/auth-store';

const log = createLogger('PasskeysSheet');

/**
 * The account's passkeys (iOS): Supabase's name for each (the provider, such as iCloud Keychain)
 * and the day it was added; adding one with Face ID; deleting one after a system alert. A deleted
 * passkey stays in iCloud Keychain until the user removes it there; signing in with it then says
 * it is no longer valid.
 */
export function PasskeysSheet() {
  const { t, i18n } = useTranslation();
  const listPasskeys = useAuthStore((state) => state.listPasskeys);
  const addPasskey = useAuthStore((state) => state.addPasskey);
  const deletePasskey = useAuthStore((state) => state.deletePasskey);
  const [items, setItems] = useState<PasskeyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A ref, not state: a second tap in the same frame must already see the first request.
  const inFlight = useRef(false);

  useEffect(() => {
    let open = true;
    listPasskeys().then(
      (list) => open && setItems(list),
      (err: unknown) => {
        log.warn('Loading the passkeys failed', err);
        if (open) setError(passkeyErrorMessage(err, t));
      },
    );
    return () => {
      open = false;
    };
  }, [listPasskeys, t]);

  async function change(request: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await request();
      setItems(await listPasskeys());
    } catch (err) {
      log.warn('Changing the passkeys failed', err);
      setError(passkeyErrorMessage(err, t));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const name = (item: PasskeyItem) => item.name || t('auth.passkey.defaultName');

  function confirmDelete(item: PasskeyItem) {
    Alert.alert(
      t('auth.passkey.deleteTitle'),
      t('auth.passkey.deleteMessage', { name: name(item) }),
      [
        { text: t('auth.passkey.cancelBtn'), style: 'cancel' },
        {
          text: t('auth.passkey.deleteBtn'),
          style: 'destructive',
          onPress: () => void change(() => deletePasskey(item.id)),
        },
      ],
    );
  }

  const added = (item: PasskeyItem) =>
    new Date(item.createdAt).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  return (
    <Sheet title={t('auth.passkey.title')}>
      <View style={styles.body}>
        <Text style={styles.muted}>{t('auth.passkey.subtitle')}</Text>
        {items === null && !error && <Text style={styles.muted}>{t('common.loading')}</Text>}
        {items?.length === 0 && <Text>{t('auth.passkey.empty')}</Text>}
        {items?.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text>{name(item)}</Text>
            <Text variant="caption" style={styles.muted}>
              {t('auth.passkey.added', { date: added(item) })}
            </Text>
            <Button
              variant="plain"
              label={t('auth.passkey.deleteBtn')}
              onPress={() => confirmDelete(item)}
              disabled={busy}
            />
          </View>
        ))}
        {error && (
          <Text role="alert" variant="caption" style={styles.error}>
            {error}
          </Text>
        )}
        <Button
          label={busy ? t('auth.passkey.workingBtn') : t('auth.passkey.addBtn')}
          onPress={() => void change(addPasskey)}
          disabled={busy}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  item: { gap: space.xxs },
  muted: { color: color.onSurfaceVariant },
  error: { color: color.error },
});
