import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { createLogger } from '@/core/logging/logger';
import { color } from '@/core/theme/tokens';

import { passkeyErrorMessage } from './auth-errors';
import { type PasskeyItem, useAuthStore } from './stores/auth-store';

const log = createLogger('PasskeysSheet');

/**
 * The account's passkeys (iOS), as Settings lists them: one row each, Supabase's name for it (the
 * provider, such as Apple Passwords) and when it was added, day and time, since several often share
 * a name; its own delete button (and a swipe), and an alert naming the same passkey. Adding one
 * uses Face ID. A deleted passkey stays in the Passwords app until the user removes it there;
 * signing in with it then says it is no longer valid.
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
      t('auth.passkey.deleteMessage', { name: name(item), date: added(item) }),
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
    new Date(item.createdAt).toLocaleString(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const remove = (item: PasskeyItem) => ({
    label: t('auth.passkey.deleteNamed', { name: name(item), date: added(item) }),
    icon: 'delete' as const,
    destructive: true,
    onPress: () => confirmDelete(item),
  });

  return (
    <Screen fit>
      <Page title={t('auth.passkey.title')} onClose={() => router.back()}>
        <ListSection footer={t('auth.passkey.subtitle')}>
          {items === null && !error ? (
            <ListRow title={t('common.loading')} disabled />
          ) : items?.length === 0 ? (
            <ListRow title={t('auth.passkey.empty')} disabled />
          ) : (
            items?.map((item) => (
              <ListRow
                key={item.id}
                title={name(item)}
                subtitle={t('auth.passkey.added', { date: added(item) })}
                icon="lock"
                accessory={busy ? undefined : remove(item)}
                swipeActions={busy ? undefined : [remove(item)]}
              />
            ))
          )}
        </ListSection>
        <ListSection footer={error ?? undefined}>
          <ListRow
            title={busy ? t('auth.passkey.workingBtn') : t('auth.passkey.addBtn')}
            icon="add"
            iconColor={color.primary}
            chevron={false}
            disabled={busy}
            onPress={() => void change(addPasskey)}
          />
        </ListSection>
      </Page>
    </Screen>
  );
}
