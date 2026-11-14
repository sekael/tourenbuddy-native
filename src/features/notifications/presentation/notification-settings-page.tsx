import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';
import { useStore } from 'zustand';

import { ListRow, ListSection, ToggleRow } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { connectivity } from '@/core/offline/online';
import { MUTABLE_NOTIFICATION_TYPES } from '@/features/notifications/domain/entities/notification-preferences';

import { useNotificationsStore } from './stores/notifications-store';

/**
 * Notification settings (notifications): push on this device, email, and which kinds alert at
 * all; everything still collects in the inbox. Push needs the network to switch.
 */
export function NotificationSettingsPage() {
  const { t } = useTranslation();
  const prefs = useNotificationsStore((s) => s.prefs);
  const pushEnabled = useNotificationsStore((s) => s.pushEnabled);
  const permission = useNotificationsStore((s) => s.permission);
  const online = useStore(connectivity, (s) => s.online);
  const store = useNotificationsStore.getState();
  const denied = permission === 'denied';
  const pushAvailable = Platform.OS !== 'web';
  const allOff = !pushEnabled && !prefs?.notifEmailEnabled;

  const fail = (error: unknown) => {
    if (error) Alert.alert(t('common.genericError'));
  };

  return (
    <Page title={t('notifications.sectionTitle')}>
      <ListSection
        footer={
          !pushAvailable
            ? t('notifications.pushUnavailable')
            : denied
              ? t('notifications.deniedHint')
              : allOff
                ? t('notifications.allOffDisclaimer')
                : undefined
        }
      >
        <ToggleRow
          title={t('notifications.pushLabel')}
          subtitle={t('notifications.pushDescription')}
          icon="notifications"
          value={pushEnabled}
          disabled={!pushAvailable || !online || denied}
          onValueChange={(on) => void store.setPushEnabled(on).catch(fail)}
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
            value={!prefs?.notifMutedTypes.includes(type)}
            disabled={!prefs}
            onValueChange={(on) => void store.setTypeMuted(type, !on).catch(fail)}
          />
        ))}
      </ListSection>
    </Page>
  );
}

const TYPE_DESCRIPTIONS = {
  tour_interest: true,
  tour_suggestions: true,
  availability: true,
  tour_reminders: true,
};
