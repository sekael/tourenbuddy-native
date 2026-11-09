import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { color, type } from '@/core/theme/tokens';

export type TextProps = RNTextProps & {
  variant?: keyof typeof type;
  /** Heading level on web (`h1` by default); iOS and Android have no levels. */
  level?: 2 | 3;
};

/** Text in the app's type scale and font (Inter on Android and web, the system font on iOS). */
export function Text({ variant = 'body', level, style, ...props }: TextProps) {
  return (
    <RNText
      {...props}
      {...(level && { 'aria-level': level })}
      style={[type[variant], { color: color.onBackground }, style]}
    />
  );
}
