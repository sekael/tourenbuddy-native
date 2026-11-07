import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { icons } from '@/core/adaptive/icons';
import { color, type } from '@/core/theme/tokens';

/**
 * iOS and Android: the system tab bar, Liquid Glass on iOS and the Material 3 navigation bar on
 * Android. Web has its own layout file.
 */
export default function TabsLayout() {
  const { t } = useTranslation();

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
    </NativeTabs>
  );
}
