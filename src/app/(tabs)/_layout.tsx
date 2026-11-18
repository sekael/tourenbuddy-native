import { usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { icons } from '@/core/adaptive/icons';
import { PageReturn } from '@/core/adaptive/page-return';
import { color, type } from '@/core/theme/tokens';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useInboxAttention } from '@/features/notifications/presentation/inbox-sheet';
import { setAppBadge } from '@/features/notifications/presentation/stores/notifications-store';
import { TourReturn, useTourOnTab } from '@/features/onboarding/presentation/tour-return';

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
  // The home screen's icon counts what Profile does.
  useEffect(() => setAppBadge(attention), [attention]);
  // Only on the tab the tour's row opened: a sheet it opened over the map has its own row.
  const touring = useTourOnTab(usePathname());
  // expo-router shows any text it is given, `hidden` or not: a zero gets none.
  const badge = (count: number) => (count > 9 ? '9+' : String(count));

  // The tabs' way back is their accessory, not each page's bottom bar.
  return (
    <PageReturn.Provider value={null}>
      <NativeTabs
        tintColor={color.primary}
        // Android only: iOS draws its own selection and uses the system font.
        indicatorColor={color.secondaryContainer}
        labelStyle={{ fontFamily: type.label.fontFamily }}
      >
        {/* iOS 26: after a feature opened from the guided tour, the way back to it (Android: none yet). */}
        {touring ? (
          <NativeTabs.BottomAccessory>
            <TourReturn />
          </NativeTabs.BottomAccessory>
        ) : null}
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
            {requests ? badge(requests) : undefined}
          </NativeTabs.Trigger.Badge>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Label>{t('shell.tabs.profile')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={icons.profile.sf} md="account_circle" />
          <NativeTabs.Trigger.Badge hidden={attention === 0}>
            {attention ? badge(attention) : undefined}
          </NativeTabs.Trigger.Badge>
        </NativeTabs.Trigger>
      </NativeTabs>
    </PageReturn.Provider>
  );
}
