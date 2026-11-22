import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { useFormatter } from '@/core/i18n/format';
import { color, radius } from '@/core/theme/tokens';
import { haversineMeters } from '@/core/utils/haversine';
import type { LngLat } from '@/features/map/domain/entities/trail';

const HEIGHT = 72;
const LEFT = 44;
const BOTTOM = 16;
const TOP = 6;
const LABEL = 10;

/**
 * Height over distance of a line, as the swisstopo app draws it under a tour (track-drawing, ported
 * from the PWA): a red line on a filled area, the highest and lowest point and the length. Hidden
 * from VoiceOver: the numbers above it say the same.
 */
export function ElevationProfile({
  line,
  heights,
}: {
  line: readonly LngLat[];
  heights: readonly (number | null)[];
}) {
  const { formatElevation, formatDistance } = useFormatter();
  const [width, setWidth] = useState(0);

  const stations = stationsOf(line, heights).filter(
    (s): s is { d: number; h: number } => s.h != null,
  );

  let chart = null;
  if (stations.length >= 2 && width > LEFT) {
    const total = stations.at(-1)!.d || 1;
    const low = Math.min(...stations.map((p) => p.h));
    const high = Math.max(...stations.map((p) => p.h));
    // At least 50 m of range, so a flat walk doesn't draw as a mountain.
    const pad = Math.max(0, 50 - (high - low)) / 2;
    const [min, max] = [low - pad, high + pad];
    const x = (d: number) => LEFT + (d / total) * (width - LEFT - 4);
    const y = (h: number) => TOP + (1 - (h - min) / (max - min)) * (HEIGHT - TOP - BOTTOM);
    const pts = stations.map((p) => `${x(p.d).toFixed(1)},${y(p.h).toFixed(1)}`);
    const base = HEIGHT - BOTTOM;
    const right = width - 4;
    chart = (
      <Svg width={width} height={HEIGHT}>
        {[high, low].map((h) => (
          <Line
            key={h}
            x1={LEFT}
            x2={right}
            y1={y(h)}
            y2={y(h)}
            stroke={color.outlineVariant}
            strokeDasharray="2 3"
          />
        ))}
        <SvgText x={LEFT - 6} y={y(high) + 4} textAnchor="end" {...label}>
          {formatElevation(Math.round(high))}
        </SvgText>
        <SvgText x={LEFT - 6} y={y(low) + 4} textAnchor="end" {...label}>
          {formatElevation(Math.round(low))}
        </SvgText>
        <SvgText x={LEFT} y={HEIGHT - 2} {...label}>
          0
        </SvgText>
        <SvgText x={right} y={HEIGHT - 2} textAnchor="end" {...label}>
          {formatDistance(total)}
        </SvgText>
        <Path
          d={`M${x(0)},${base}L${pts.join('L')}L${x(stations.at(-1)!.d)},${base}Z`}
          fill={color.elevationFill}
        />
        <Path
          d={`M${pts.join('L')}`}
          fill="none"
          stroke={color.elevation}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {[stations[0]!, stations.at(-1)!].map((p, i) => (
          <Circle key={i} cx={x(p.d)} cy={y(p.h)} r={3.5} fill={color.elevation} />
        ))}
      </Svg>
    );
  }

  return (
    <View
      style={styles.box}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {chart}
    </View>
  );
}

/** Distance along the line and height of each point that has one. */
function stationsOf(line: readonly LngLat[], heights: readonly (number | null)[]) {
  const along: number[] = [];
  line.forEach((p, i) => along.push(i > 0 ? along[i - 1]! + haversineMeters(line[i - 1]!, p) : 0));
  return line.map((_, i) => ({ d: along[i]!, h: heights[i] }));
}

const label = { fill: color.onSurfaceVariant, fontSize: LABEL } as const;

const styles = StyleSheet.create({
  box: { height: HEIGHT, borderRadius: radius.sm, backgroundColor: color.surfaceVariant },
});
