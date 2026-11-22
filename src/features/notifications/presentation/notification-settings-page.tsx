import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { useStore } from 'zustand';

import { ListRow, ListSection, ToggleRow } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { connectivity } from '@/core/offline/online';
import { MUTABLE_NOTIFICATION_TYPES } from '@/features/notifications/domain/entities/notification-preferences';

import { useNotificationsStore, PushTokenTimeout } from './stores/notifications-store';

/**
 * Notification settings (notifications): push on this device, email, and which kinds alert at
 * all; everything still collects in the inbox. Push needs the network to switch.
 */
export function NotificationSettingsPage() {
  const { t } = useTranslation();
  const prefs = useNotificationsStore((s) => s.prefs);
  const pushEnabled = useNotificationsStore((s) => s.pushEnabled);
  const pushPending = useNotificationsStore((s) => s.pushPending);
  const permission = useNotificationsStore((s) => s.permission);
  const online = useStore(connectivity, (s) => s.online);
  const store = useNotificationsStore.getState();
  const denied = permission === 'denied';
  const pushAvailable = Platform.OS !== 'web';
  const allOff = !pushEnabled && !prefs?.notifEmailEnabled;

  // Back from the Settings app (where a denied permission is fixed), the page reads it anew: at
  // once and a moment later, as iOS can still answer with the old permission right on return.
  useEffect(() => {
    let later: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const check = () => void useNotificationsStore.getState().ensurePushToken();
      check();
      clearTimeout(later);
      later = setTimeout(check, SETTINGS_RECHECK_MS);
    });
    return () => {
      sub.remove();
      clearTimeout(later);
    };
  }, []);

  const fail = (error: unknown) => {
    if (error) Alert.alert(t('common.genericError'));
  };
  const pushFailed = (error: unknown) =>
    Alert.alert(
      t(
        error instanceof PushTokenTimeout
          ? 'notifications.pushNoToken'
          : 'notifications.pushFailed',
      ),
    );

  return (
    <Page title={t('notifications.sectionTitle')}>
      <ListSection
        footer={
          !pushAvailable
            ? t('notifications.pushUnavailable')
            : denied
              ? t('notifications.deniedHintApp')
              : !online
                ? t('notifications.pushOffline')
                : allOff
                  ? t('notifications.allOffDisclaimer')
                  : undefined
        }
      >
        <ToggleRow
          title={t('notifications.pushLabel')}
          subtitle={t('notifications.pushDescription')}
          icon="notifications"
          // On while it switches on: the system's prompt and the token take a moment.
          value={pushEnabled || pushPending}
          disabled={!pushAvailable || !online || denied || pushPending}
          onValueChange={(on) => void store.setPushEnabled(on).catch(pushFailed)}
        />
        <ToggleRow
          title={t('notifications.emailLabel')}
          subtitle={t('notifications.emailDescription')}
          icon="mail"
          value={!!prefs?.notifEmailEnabled}
          disabled={!prefs}
          onValueChange={(on) => void store.setEmailEnabled(on).catch(fail)}
        />
        {denied ? (
          <ListRow
            title={t('common.openSettings')}
            icon="open_in_new"
            onPress={() => void Linking.openSettings()}
          />
        ) : null}
      </ListSection>
      <ListSection title={t('notifications.typesLabel')} footer={t('notifications.typesHint')}>
        {MUTABLE_NOTIFICATION_TYPES.map((type) => (
          <ToggleRow
            key={type}
            title={t(`notifications.type.${type}`)}
            subtitle={
              type in TYPE_DESCRIPTIONS
                ? t(`notifications.typeDescription.${type}` as never)
                : undefined
            }
            // With push and email off nothing alerts: the kinds show off and wait (as in the PWA).
            value={!allOff && !prefs?.notifMutedTypes.includes(type)}
            disabled={!prefs || allOff}
            onValueChange={(on) => void store.setTypeMuted(type, !on).catch(fail)}
          />
        ))}
      </ListSection>
    </Page>
  );
}

const SETTINGS_RECHECK_MS = 1000;

const TYPE_DESCRIPTIONS = {
  tour_interest: true,
  tour_suggestions: true,
  availability: true,
  tour_reminders: true,
};
