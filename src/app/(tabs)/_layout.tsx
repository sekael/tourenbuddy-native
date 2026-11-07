import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { color, type } from '@/core/theme/tokens';

/** Android: the system's Material 3 navigation bar. iOS and web have their own layout files. */
export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <NativeTabs
      tintColor={color.primary}
      indicatorColor={color.secondaryContainer}
      labelStyle={{ fontFamily: type.label.fontFamily }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('shell.tabs.map')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>{t('shell.tabs.calendar')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="calendar_month" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
