import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/core/adaptive/icon';
import type { IconName } from '@/core/adaptive/icons';
import { Text } from '@/core/adaptive/text';
import { color, radius, space, strong } from '@/core/theme/tokens';
import { useBreakpoint } from '@/core/theme/use-breakpoint';

/**
 * Web has no system tab bar: a Material 3 navigation bar on phones, a navigation rail from
 * 600 px, so a desktop window gets a side layout instead of a stretched phone.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const rail = useBreakpoint() !== 'compact';

  // `Tabs` finds its tabs only in a `TabList` that is its direct child: the bar goes inside it.
  const nav = (
    <TabList asChild>
      <SafeAreaView
        role="tablist"
        edges={rail ? ['left'] : ['bottom']}
        style={rail ? styles.rail : styles.bar}
      >
        <TabTrigger name="index" href="/" asChild>
          <NavItem icon="map" label={t('shell.tabs.map')} />
        </TabTrigger>
        <TabTrigger name="calendar" href="/calendar" asChild>
          <NavItem icon="calendar" label={t('shell.tabs.calendar')} />
        </TabTrigger>
        <TabTrigger name="contacts" href="/contacts" asChild>
          <NavItem icon="contacts" label={t('shell.tabs.contacts')} />
        </TabTrigger>
        <TabTrigger name="profile" href="/profile" asChild>
          <NavItem icon="profile" label={t('shell.tabs.profile')} />
        </TabTrigger>
      </SafeAreaView>
    </TabList>
  );

  return (
    <Tabs style={rail ? styles.row : styles.column}>
      {rail && nav}
      <TabSlot style={styles.slot} />
      {!rail && nav}
    </Tabs>
  );
}

// The slot props type the ref for the class `View` of older React Native; the runtime ref works.
type NavItemProps = Omit<TabTriggerSlotProps, 'ref'> & { icon: IconName; label: string };

function NavItem({ icon, label, isFocused, ...props }: NavItemProps) {
  return (
    <Pressable {...props} role="tab" aria-selected={isFocused} style={styles.item}>
      {({ hovered, pressed }) => (
        <>
          <View
            style={[
              styles.indicator,
              (hovered || pressed) && styles.indicatorHover,
              isFocused && styles.indicatorActive,
            ]}
          >
            <Icon
              name={icon}
              color={isFocused ? color.onSecondaryContainer : color.onSurfaceVariant}
            />
          </View>
          <Text variant="caption" style={[styles.label, isFocused && styles.labelActive]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  slot: { flex: 1 },
  // One style object each: `TabList`'s slot spreads its child's style, so an array breaks it.
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: space.sm,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  // TabList lays its child out as a row; the rail stacks.
  rail: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.md,
    width: 88,
    paddingTop: space.xl,
    backgroundColor: color.surface,
    borderRightWidth: 1,
    borderRightColor: color.divider,
  },
  item: { alignItems: 'center', gap: space.xxs, minWidth: 64 },
  indicator: {
    width: 64,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    transitionProperty: 'background-color',
    transitionDuration: '200ms',
  },
  indicatorHover: { backgroundColor: color.neutralContainer },
  indicatorActive: { backgroundColor: color.secondaryContainer },
  label: { color: color.onSurfaceVariant },
  labelActive: { color: color.onSurface, ...strong },
});
