import { useId, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ScrollViewInstance,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useFormatter } from '@/core/i18n/format';
import { color, radius } from '@/core/theme/tokens';
import { haversineMeters } from '@/core/utils/haversine';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { cursorLabelBox, profileSpot, type ScrubSpot } from '@/features/map/domain/profile-cursor';
import { shareColor, type Share } from '@/features/map/domain/track-bands';

const HEIGHT = 72;
const LEFT = 44;
const BOTTOM = 16;
const TOP = 6;
const LABEL = 10;
/** The tour sheet's profile (one that scrubs): taller, its cursor's label above the line. */
const TALL = 112;
const TALL_TOP = TOP + LABEL + 10;

/**
 * Height over distance of a line, as the swisstopo app draws it under a tour (track-drawing, ported
 * from the PWA): a line on a filled area, the highest and lowest point and the length. Hidden from
 * VoiceOver: the numbers above it say the same. The line wears the route's activity colours
 * (`routeShares`), not swisstopo's red (owner, 2026-11-24). With `onScrub`, a finger on it shows
 * the height and distance there, and `onScrub` names the spot (null once the finger lifts).
 */
export function ElevationProfile({
  line,
  heights,
  bands,
  marks = bands,
  onScrub,
}: {
  line: readonly LngLat[];
  heights: readonly (number | null)[];
  bands: readonly Share[];
  /** The cursor's colours along the line (the activities' own, brighter); the line's without. */
  marks?: readonly Share[];
  onScrub?: (spot: ScrubSpot | null) => void;
}) {
  const { formatElevation, formatDistance } = useFormatter();
  const [width, setWidth] = useState(0);
  const [cursor, setCursor] = useState<ScrubSpot | null>(null);
  const gradient = `profile-${useId()}`;
  const [height, top] = onScrub ? [TALL, TALL_TOP] : [HEIGHT, TOP];

  const stations = stationsOf(line, heights).filter(
    (s): s is { d: number; h: number } => s.h != null,
  );

  let chart = null;
  let scrub: ((x: number) => void) | null = null;
  if (stations.length >= 2 && width > LEFT) {
    const total = stations.at(-1)!.d || 1;
    const low = Math.min(...stations.map((p) => p.h));
    const high = Math.max(...stations.map((p) => p.h));
    // At least 50 m of range, so a flat walk doesn't draw as a mountain.
    const pad = Math.max(0, 50 - (high - low)) / 2;
    const [min, max] = [low - pad, high + pad];
    const x = (d: number) => LEFT + (d / total) * (width - LEFT - 4);
    const y = (h: number) => top + (1 - (h - min) / (max - min)) * (height - top - BOTTOM);
    const pts = stations.map((p) => `${x(p.d).toFixed(1)},${y(p.h).toFixed(1)}`);
    const base = height - BOTTOM;
    const right = width - 4;
    scrub = (px: number) => {
      const found = profileSpot(line, heights, ((px - LEFT) / (right - LEFT)) * total);
      // The activity's colour there, as on the line and the map's dot.
      const spot = found && { ...found, color: shareColor(marks, found.share) ?? color.primary };
      setCursor(spot);
      onScrub?.(spot);
    };
    const at = cursor ? x(Math.min(cursor.distance, total)) : 0;
    const text = cursor
      ? `${formatElevation(Math.round(cursor.height))} · ${formatDistance(cursor.distance)}`
      : '';
    const mark = cursor && {
      x: at,
      y: y(cursor.height),
      color: cursor.color,
      text,
      box: cursorLabelBox(at, text, LEFT, right),
    };
    chart = (
      <Svg width={width} height={height}>
        <Defs>
          {/* Hard bands along the distance: two stops per band, at its ends. */}
          <LinearGradient
            id={gradient}
            gradientUnits="userSpaceOnUse"
            x1={x(0)}
            x2={right}
            y1={0}
            y2={0}
          >
            {bands.flatMap((band, i) => [
              <Stop key={`${i}a`} offset={band.from} stopColor={band.color} />,
              <Stop key={`${i}b`} offset={band.to} stopColor={band.color} />,
            ])}
          </LinearGradient>
        </Defs>
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
        <SvgText x={LEFT} y={height - 2} {...label}>
          0
        </SvgText>
        <SvgText x={right} y={height - 2} textAnchor="end" {...label}>
          {formatDistance(total)}
        </SvgText>
        <Path
          d={`M${x(0)},${base}L${pts.join('L')}L${x(stations.at(-1)!.d)},${base}Z`}
          fill={`url(#${gradient})`}
          fillOpacity={0.12}
        />
        <Path
          d={`M${pts.join('L')}`}
          fill="none"
          stroke={`url(#${gradient})`}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {[
          { p: stations[0]!, fill: bands[0]?.color },
          { p: stations.at(-1)!, fill: bands.at(-1)?.color },
        ].map(({ p, fill }, i) => (
          <Circle key={i} cx={x(p.d)} cy={y(p.h)} r={3.5} fill={fill} />
        ))}
        {mark ? (
          <>
            <Line x1={mark.x} x2={mark.x} y1={TOP} y2={base} stroke={color.onSurface} />
            <Circle
              cx={mark.x}
              cy={mark.y}
              r={4.5}
              fill={mark.color}
              stroke={color.background}
              strokeWidth={2}
            />
            {/* On a box of its own: over the line and the end dots it stays legible. */}
            <Rect
              x={mark.box.x}
              y={TOP - 2}
              width={mark.box.width}
              height={LABEL + 7}
              rx={4}
              fill={color.background}
              fillOpacity={0.92}
            />
            <SvgText
              x={mark.box.x + 5}
              y={TOP + LABEL}
              fill={color.onSurface}
              fontSize={LABEL + 1}
              fontWeight="600"
            >
              {mark.text}
            </SvgText>
          </>
        ) : null}
      </Svg>
    );
  }

  const end = () => {
    setCursor(null);
    onScrub?.(null);
  };
  // The finger keeps the profile: neither the sheet nor its list takes the drag away. On iOS a
  // sideways drag anywhere on a pushed page is the system's swipe back, which a JS responder can't
  // hold off; a scroll view that can scroll sideways can (`ScrubSurface`).
  const touch =
    onScrub && scrub && Platform.OS !== 'ios'
      ? {
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,
          onResponderTerminationRequest: () => false,
          onResponderGrant: (e: GestureResponderEvent) => scrub!(e.nativeEvent.locationX),
          onResponderMove: (e: GestureResponderEvent) => scrub!(e.nativeEvent.locationX),
          onResponderRelease: end,
          onResponderTerminate: end,
        }
      : {};

  return (
    <View
      style={[styles.box, { height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      {...touch}
    >
      {/* Touches land on the box, so their x is the box's own. */}
      <View pointerEvents="none">{chart}</View>
      {onScrub && scrub && Platform.OS === 'ios' ? (
        <ScrubSurface onMove={scrub} onEnd={end} />
      ) : null}
    </View>
  );
}

/** Where the scrub surface's content starts out: far from both ends, so it scrolls either way. */
const MIDDLE = 100_000;

/**
 * A see-through sideways scroll view over the chart: the drag is its own, so the page doesn't go
 * back and the list doesn't take it. The finger's x is where it touched the content, less how far
 * the content has scrolled since. Let go, it springs back to the middle at once.
 */
function ScrubSurface({ onMove, onEnd }: { onMove: (x: number) => void; onEnd: () => void }) {
  const scroller = useRef<ScrollViewInstance>(null);
  const offset = useRef(MIDDLE);
  const touched = useRef<number | null>(null);
  const end = () => {
    if (touched.current === null) return;
    touched.current = null;
    offset.current = MIDDLE;
    scroller.current?.scrollTo({ x: MIDDLE, animated: false });
    onEnd();
  };
  return (
    <ScrollView
      ref={scroller}
      testID="profile-scrub"
      horizontal
      style={StyleSheet.absoluteFill}
      contentContainerStyle={styles.scrubContent}
      contentOffset={{ x: MIDDLE, y: 0 }}
      showsHorizontalScrollIndicator={false}
      bounces={false}
      decelerationRate={0}
      scrollEventThrottle={16}
      onTouchStart={(e) => {
        touched.current = e.nativeEvent.locationX;
        onMove(touched.current - offset.current);
      }}
      onScroll={(e) => {
        offset.current = e.nativeEvent.contentOffset.x;
        if (touched.current !== null) onMove(touched.current - offset.current);
      }}
      onTouchEnd={end}
      onScrollEndDrag={end}
    />
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
  box: { borderRadius: radius.sm, backgroundColor: color.surfaceVariant },
  scrubContent: { width: MIDDLE * 2 },
});
