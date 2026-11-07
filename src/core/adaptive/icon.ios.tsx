import { SymbolView } from 'expo-symbols';

import { size as sizes } from '@/core/theme/tokens';

import { icons } from './icons';
import type { IconProps } from './icon';

/** SF Symbol (iOS). Decorative: the control carries the label. */
export function Icon({ name, size = sizes.icon, color }: IconProps) {
  return (
    <SymbolView
      name={icons[name].sf}
      size={size}
      tintColor={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
