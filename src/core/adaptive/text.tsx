import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { color, type } from '@/core/theme/tokens';

export type TextProps = RNTextProps & { variant?: keyof typeof type };

/** Text in the app's type scale and font (Inter on Android and web, the system font on iOS). */
export function Text({ variant = 'body', style, ...props }: TextProps) {
  return <RNText {...props} style={[type[variant], { color: color.onBackground }, style]} />;
}
