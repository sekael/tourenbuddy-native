import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { icons } from '@/core/adaptive/icons';
import { color, type } from '@/core/theme/tokens';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useInboxAttention } from '@/features/notifications/presentation/inbox-sheet';

/**
 * iOS and Android: the system tab bar, Liquid Glass on iOS and the Material 3 navigation bar on
 * Android. Web has its own layout file.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  // The inbox's unread, still actionable entries on Profile; pending friend requests on Contacts.
  const attention = useInboxAttention();
  const requests = useFriendshipsStore(
    (s) => s.incoming.filter((r) => r.status === 'pending').length,
  );
  const badge = (count: number) => (count > 9 ? '9+' : String(count));

  return (
    <NativeTabs
      tintColor={color.primary}
      // Android only: iOS draws its own selection and uses the system font.
      indicatorColor={color.secondaryContainer}
      labelStyle={{ fontFamily: type.label.fontFamily }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('shell.tabs.map')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={icons.map.sf} md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>{t('shell.tabs.calendar')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={icons.calendar.sf} md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="contacts">
        <NativeTabs.Trigger.Label>{t('shell.tabs.contacts')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={icons.contacts.sf} md="group" />
        <NativeTabs.Trigger.Badge hidden={requests === 0}>
          {badge(requests)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('shell.tabs.profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={icons.profile.sf} md="account_circle" />
        <NativeTabs.Trigger.Badge hidden={attention === 0}>
          {badge(attention)}
        </NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
