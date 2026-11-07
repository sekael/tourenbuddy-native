import { router, type NativeStackNavigationOptions } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, space } from '@/core/theme/tokens';

import { SheetHeader } from './sheet-header';

/**
 * Screen options for a sheet route: a system sheet sized to its content. On iOS it stays clear
 * so the system draws Liquid Glass at partial height; on Android it is the Material bottom sheet.
 */
export const sheetOptions: NativeStackNavigationOptions = {
  presentation: 'formSheet',
  sheetAllowedDetents: 'fitToContents',
  headerShown: false,
  contentStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : color.background },
};

export type SheetProps = { title: string; children: ReactNode };

/** Content of a sheet route: title, close button, then the body, sized to fit. */
export function Sheet({ title, children }: SheetProps) {
  return (
    <SafeAreaView edges={{ bottom: 'maximum' }} style={styles.sheet}>
      <SheetHeader title={title} onClose={() => router.back()} />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: space.xl },
});
