import { useId, useRef, useState, type PointerEvent } from 'react';

import { haversineMeters } from '@/core/utils/haversine';
import { classes } from '@/core/web/classes';
import { useElementSize } from '@/core/web/use-element-size.web';
import { useFormatter } from '@/core/web/use-formatter.web';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { cursorLabelBox, profileSpot, type ScrubSpot } from '@/features/map/domain/profile-cursor';
import { shareColor, type Share } from '@/features/map/domain/track-bands';

import styles from './elevation-profile.module.css';

const c = classes(styles);

const HEIGHT = 72;
const LEFT = 44;
const BOTTOM = 16;
const TOP = 6;
/** The tour sheet's profile (one that scrubs): taller, its cursor's label above the line. */
const TALL = 112;
const TALL_TOP = 26;

/**
 * Height over distance of a line, as the swisstopo app draws it under a tour: a line on a filled
 * area, in the route's activity colours (`routeShares`), not swisstopo's red (owner, 2026-11-24).
 */
export function ElevationProfile({
  line,
  heights,
  bands,
  marks = bands,
  onScrub,
}: {
  line: LngLat[];
  heights: (number | null)[];
  bands: readonly Share[];
  /** The cursor's colours along the line (the activities' own, brighter); the line's without. */
  marks?: readonly Share[];
  /** A finger or a pressed mouse dragging along the profile: the spot it points at; null on release. */
  onScrub?: (spot: ScrubSpot | null) => void;
}) {
  const [cursor, setCursor] = useState<ScrubSpot | null>(null);
  const { formatElevation, formatDistance } = useFormatter();
  const gradient = `profile-${useId()}`;
  const [height, top] = onScrub ? [TALL, TALL_TOP] : [HEIGHT, TOP];
  const box = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(box);

  let walked = 0;
  const stations = line
    .map((p, i) => ({ d: (walked += i > 0 ? haversineMeters(line[i - 1]!, p) : 0), h: heights[i] }))
    .filter((s): s is { d: number; h: number } => s.h != null);

  let chart = null;
  if (stations.length >= 2 && width > LEFT) {
    const s = stations;
    const total = s.at(-1)!.d || 1;
    const low = Math.min(...s.map((p) => p.h));
    const high = Math.max(...s.map((p) => p.h));
    // At least 50 m of range, so a flat walk doesn't draw as a mountain.
    const pad = Math.max(0, 50 - (high - low)) / 2;
    const [min, max] = [low - pad, high + pad];
    const x = (d: number) => LEFT + (d / total) * (width - LEFT - 4);
    const y = (h: number) => top + (1 - (h - min) / (max - min)) * (height - top - BOTTOM);
    const pts = s.map((p) => `${x(p.d).toFixed(1)},${y(p.h).toFixed(1)}`);
    const base = height - BOTTOM;
    chart = {
      line: `M${pts.join('L')}`,
      area: `M${x(0)},${base}L${pts.join('L')}L${x(s.at(-1)!.d)},${base}Z`,
      first: { x: x(0), y: y(s[0]!.h) },
      last: { x: x(s.at(-1)!.d), y: y(s.at(-1)!.h) },
      labels: {
        high: formatElevation(Math.round(high)),
        low: formatElevation(Math.round(low)),
        total: formatDistance(total),
      },
      yHigh: y(high),
      yLow: y(low),
      right: width - 4,
      total,
      x,
      y,
      base,
    };
  }

  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    if (!chart || !onScrub) return;
    const px = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const found = profileSpot(line, heights, ((px - LEFT) / (chart.right - LEFT)) * chart.total);
    // The activity's colour there, as on the line and the map's dot.
    const spot = found && {
      ...found,
      color: shareColor(marks, found.share) ?? 'var(--color-primary)',
    };
    setCursor(spot);
    onScrub(spot);
  };
  const leave = () => {
    if (!onScrub) return;
    setCursor(null);
    onScrub(null);
  };
  const at = chart && cursor ? chart.x(Math.min(cursor.distance, chart.total)) : 0;
  const text = cursor
    ? `${formatElevation(Math.round(cursor.height))} · ${formatDistance(cursor.distance)}`
    : '';
  const mark = chart &&
    cursor && {
      x: at,
      y: chart.y(cursor.height),
      color: cursor.color,
      text,
      box: cursorLabelBox(at, text, LEFT, chart.right),
    };

  return (
    <div
      ref={box}
      className={c('elevation-profile', { 'elevation-profile--scrub': !!onScrub })}
      aria-hidden="true"
      onPointerDown={(event) => {
        // A press keeps the profile while it drags along it, outside it too.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        scrub(event);
      }}
      // Only a drag scrubs: a mouse passing over would jerk the map along (owner, 2026-11-26).
      onPointerMove={(event) => event.buttons !== 0 && scrub(event)}
      onPointerUp={leave}
      onPointerCancel={leave}
    >
      {chart && (
        <svg width={width} height={height}>
          <defs>
            {/* Hard bands along the distance: two stops per band, at its ends. */}
            <linearGradient
              id={gradient}
              gradientUnits="userSpaceOnUse"
              x1={LEFT}
              x2={chart.right}
              y1={0}
              y2={0}
            >
              {bands.flatMap((band, i) => [
                <stop key={`${i}a`} offset={band.from} stopColor={band.color} />,
                <stop key={`${i}b`} offset={band.to} stopColor={band.color} />,
              ])}
            </linearGradient>
          </defs>
          <line
            className={c('grid')}
            x1={LEFT}
            x2={chart.right}
            y1={chart.yHigh}
            y2={chart.yHigh}
          />
          <line className={c('grid')} x1={LEFT} x2={chart.right} y1={chart.yLow} y2={chart.yLow} />
          <text className={c('label')} x={LEFT - 6} y={chart.yHigh + 4} textAnchor="end">
            {chart.labels.high}
          </text>
          <text className={c('label')} x={LEFT - 6} y={chart.yLow + 4} textAnchor="end">
            {chart.labels.low}
          </text>
          <text className={c('label')} x={LEFT} y={height - 2}>
            0
          </text>
          <text className={c('label')} x={chart.right} y={height - 2} textAnchor="end">
            {chart.labels.total}
          </text>
          <path className={c('area')} d={chart.area} fill={`url(#${gradient})`} />
          <path className={c('profile')} d={chart.line} stroke={`url(#${gradient})`} />
          <circle cx={chart.first.x} cy={chart.first.y} r="3.5" fill={bands[0]?.color} />
          <circle cx={chart.last.x} cy={chart.last.y} r="3.5" fill={bands.at(-1)?.color} />
          {mark && (
            <g data-testid="profile-cursor">
              <line className={c('cursor')} x1={mark.x} x2={mark.x} y1={TOP} y2={chart.base} />
              <circle
                className={c('cursor-dot')}
                cx={mark.x}
                cy={mark.y}
                r="4.5"
                style={{ fill: mark.color }}
              />
              {/* On a box of its own: over the line and the end dots it stays legible. */}
              <rect
                className={c('cursor-box')}
                x={mark.box.x}
                y={TOP - 2}
                width={mark.box.width}
                height={17}
                rx="4"
              />
              <text className={c('cursor-label')} x={mark.box.x + 5} y={TOP + 10}>
                {mark.text}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
