import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/core/adaptive/icon';
import type { IconName } from '@/core/adaptive/icons';
import { color } from '@/core/theme/tokens';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_ICONS,
  type TourType,
} from '@/features/tours/data/models/tour-type';

/**
 * A tour's activities in one disc, as on its map marker: one activity fills it; several share it
 * in equal slices from 12 o'clock, each in its colour with its glyph.
 */
export function ActivityDisc({ types, size }: { types: readonly TourType[]; size: number }) {
  const r = size / 2;
  if (types.length <= 1) {
    const type = types[0];
    return (
      <View
        style={[
          styles.center,
          {
            width: size,
            height: size,
            borderRadius: r,
            backgroundColor: type ? TOUR_TYPE_COLORS[type] : color.primary,
          },
        ]}
      >
        <Icon
          name={(type ? TOUR_TYPE_ICONS[type] : 'tour') as IconName}
          color={color.onContrast}
          size={Math.round(size * 0.55)}
        />
      </View>
    );
  }

  const sweep = (2 * Math.PI) / types.length;
  const glyph = Math.round(size * (types.length === 2 ? 0.36 : types.length === 3 ? 0.32 : 0.27));
  const point = (angle: number, distance: number) =>
    [r + distance * Math.cos(angle), r + distance * Math.sin(angle)] as const;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {types.map((type, i) => {
          const from = -Math.PI / 2 + i * sweep;
          const [x0, y0] = point(from, r);
          const [x1, y1] = point(from + sweep, r);
          return (
            <Path
              key={type}
              d={`M${r},${r} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z`}
              fill={TOUR_TYPE_COLORS[type]}
              stroke={color.surface}
              strokeWidth={1.5}
            />
          );
        })}
      </Svg>
      {types.map((type, i) => {
        const [x, y] = point(
          -Math.PI / 2 + (i + 0.5) * sweep,
          r * (types.length === 2 ? 0.48 : 0.56),
        );
        return (
          <View
            key={type}
            pointerEvents="none"
            style={[styles.glyph, { left: x - glyph / 2, top: y - glyph / 2 }]}
          >
            <Icon name={TOUR_TYPE_ICONS[type] as IconName} color={color.onContrast} size={glyph} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  glyph: { position: 'absolute' },
});
