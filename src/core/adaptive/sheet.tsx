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

/**
 * A sheet over the map with a medium and a large height; at medium the map beside it stays live
 * (app-navigation "The map's sheets leave the map live"), as Apple Maps shows a place.
 */
export const mapSheetOptions: NativeStackNavigationOptions = {
  presentation: 'formSheet',
  sheetAllowedDetents: [0.5, 1],
  sheetInitialDetentIndex: 0,
  sheetLargestUndimmedDetentIndex: 0,
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
  headerShown: false,
  contentStyle: { backgroundColor: Platform.OS === 'ios' ? 'transparent' : color.background },
};

/**
 * The route step's, a pick's and track drawing's sheet (tour-creation-flow): small and medium,
 * both undimmed, so the map above takes taps and drags.
 */
export const stepSheetOptions: NativeStackNavigationOptions = {
  ...mapSheetOptions,
  sheetAllowedDetents: [0.3, 0.55],
  sheetInitialDetentIndex: 1,
  sheetLargestUndimmedDetentIndex: 1,
  // Swiping it away would leave the map in a step with no controls: Cancel and Done end it.
  gestureEnabled: false,
};

/** Data entry: a full-height modal with its own navigation bar (Cancel, Save). */
export const formModalOptions: NativeStackNavigationOptions = {
  presentation: 'modal',
  headerShown: false,
  contentStyle: { backgroundColor: color.surface },
};

/** The stack's screen layout: native presents sheets itself (web: a panel beside the map). */
export const sheetLayout = undefined;

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
