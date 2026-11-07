import Svg, { Path } from 'react-native-svg';

import { size as sizes } from '@/core/theme/tokens';

import { icons, type IconName } from './icons';

export type IconProps = { name: IconName; size?: number; color: string };

/** Material Symbols drawn as SVG (Android and web). Decorative: the control carries the label. */
export function Icon({ name, size = sizes.icon, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <Path d={icons[name].md} fill={color} />
    </Svg>
  );
}
