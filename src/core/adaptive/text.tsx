import { useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Text as RNText,
  StyleSheet,
  type TextProps as RNTextProps,
} from 'react-native';

import { color, type } from '@/core/theme/tokens';

export type TextProps = RNTextProps & {
  variant?: keyof typeof type;
  /** Heading level on web (`h1` by default); iOS and Android have no levels. */
  level?: 2 | 3;
};

// iOS Bold Text: UIKit and SwiftUI follow it, React Native text does not. One listener for all
// texts, registered when the first one mounts.
let boldText = false;
let watching = false;
const listeners = new Set<() => void>();
const setBoldText = (on: boolean) => {
  boldText = on;
  listeners.forEach((listener) => listener());
};
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!watching && Platform.OS === 'ios') {
    watching = true;
    void AccessibilityInfo.isBoldTextEnabled().then(setBoldText);
    AccessibilityInfo.addEventListener('boldTextChanged', setBoldText);
  }
  return () => listeners.delete(listener);
}
const getBoldText = () => boldText;

/** One step heavier, as Bold Text does to the system font: regular → semibold → bold → heavy. */
function bolder(weight: unknown) {
  const value = weight === 'bold' ? 700 : Number(weight) || 400;
  return value < 600 ? '600' : value < 700 ? '700' : '800';
}

/** Text in the app's type scale and font (Inter on Android and web, the system font on iOS). */
export function Text({ variant = 'body', level, style, ...props }: TextProps) {
  const bold = useSyncExternalStore(subscribe, getBoldText);
  const base = [type[variant], { color: color.onBackground }, style];
  return (
    <RNText
      {...props}
      {...(level && { 'aria-level': level })}
      style={bold ? [base, { fontWeight: bolder(StyleSheet.flatten(base)?.fontWeight) }] : base}
    />
  );
}
