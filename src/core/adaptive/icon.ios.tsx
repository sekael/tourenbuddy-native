import { SymbolView } from 'expo-symbols';

import { size as sizes } from '@/core/theme/tokens';

import { AppGlyph, type IconProps } from './icon';
import { icons } from './icons';

/** SF Symbol (iOS), or the app's own glyph. Decorative: the control carries the label. */
export function Icon({ name, size = sizes.icon, color }: IconProps) {
  const icon = icons[name];
  if ('svg' in icon) return <AppGlyph xml={icon.svg} size={size} color={color} />;
  return (
    <SymbolView
      name={icon.sf}
      size={size}
      tintColor={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
