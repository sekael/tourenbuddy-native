import Svg, { Path, SvgXml } from 'react-native-svg';

import { size as sizes } from '@/core/theme/tokens';

import { icons, type IconName } from './icons';

export type IconProps = { name: IconName; size?: number; color: string };

/** Material Symbols drawn as SVG (Android and web). Decorative: the control carries the label. */
export function Icon({ name, size = sizes.icon, color }: IconProps) {
  const icon = icons[name];
  if ('svg' in icon) return <AppGlyph xml={icon.svg} size={size} color={color} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <Path d={icon.md} fill={color} />
    </Svg>
  );
}

/** One of the app's own glyphs, drawn on every platform; `currentColor` takes `color`. */
export function AppGlyph({ xml, size, color }: { xml: string; size: number; color: string }) {
  return <SvgXml xml={xml} width={size} height={size} color={color} aria-hidden />;
}
