import { TabSlot, useTabsWithTriggers, useTabTrigger } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { GlassDock } from '@/core/adaptive/glass-dock';
import { useMainMenuItems } from '@/features/shell/presentation/use-main-menu-items';

/**
 * iOS: headless tabs under our own glass dock instead of the system tab bar, so the menu sits
 * level with Map and Calendar in the thumb zone.
 */
export default function TabsLayout() {
  const { NavigationContent } = useTabsWithTriggers({
    triggers: [
      { type: 'internal', name: 'index', href: '/' },
      { type: 'internal', name: 'calendar', href: '/calendar' },
    ],
  });

  return (
    <NavigationContent>
      <View style={styles.tabs}>
        <TabSlot style={styles.tabs} />
        <Dock />
      </View>
    </NavigationContent>
  );
}

function Dock() {
  const { t } = useTranslation();
  // Any registered name gives access to every trigger.
  const { getTrigger, switchTab } = useTabTrigger({ name: 'index' });
  const onMap = getTrigger('index')?.isFocused ?? true;
  const menuItems = useMainMenuItems(onMap ? 'map' : 'calendar');

  return (
    <GlassDock
      tabs={[
        { name: 'index', label: t('shell.tabs.map'), icon: 'map', selected: onMap },
        { name: 'calendar', label: t('shell.tabs.calendar'), icon: 'calendar', selected: !onMap },
      ]}
      onSelect={(name) => switchTab(name, {})}
      menuLabel={t('map.overlay.menuOpen')}
      menuItems={menuItems}
    />
  );
}

const styles = StyleSheet.create({ tabs: { flex: 1 } });
