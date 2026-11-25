import type { CSSProperties, ReactNode } from 'react';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes, join } from '@/core/web/classes';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_ICONS,
  type TourType,
} from '@/features/tours/data/models/tour-type';

import styles from './tour-type-badge.module.css';

const c = classes(styles);

/** First seam, clockwise from 12 o'clock: two activities split along "/". */
const START_DEG = -135;
// Glyph size and how far it sits from the centre (share of the radius) by slice count.
const ICON_PX = [24, 30, 24, 20];
const OFFSET = [0, 0.32, 0.45, 0.5];
/** Past four activities the fourth slice counts the rest ("+3"). */
const MAX_SLICES = 4;

function at(deg: number, r: number) {
  const a = (deg * Math.PI) / 180;
  return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) };
}

/**
 * A tour's activities as one disc: one fills it, several cut it into equal slices on a diagonal,
 * each in its colour with its icon pushed into the slice; none is a neutral pin. State stamps go
 * in `children`, outside the clipped disc.
 */
export function TourTypeBadge({
  types,
  className,
  children,
}: {
  types: readonly TourType[];
  className?: string;
  children?: ReactNode;
}) {
  const more = types.length > MAX_SLICES ? types.length - MAX_SLICES + 1 : 0;
  const drawn: (TourType | null)[] = more ? [...types.slice(0, MAX_SLICES - 1), null] : [...types];
  const n = drawn.length;
  const k = n - 1;
  const step = 360 / n;
  // Wedge corners twice the radius out, one at least every 90°, so the round clip draws the rim.
  const corners = Math.ceil(step / 90);
  const slices = drawn.map((type, i) => {
    const from = START_DEG + i * step;
    const icon = at(from + step / 2, 50 * OFFSET[k]!);
    const arc = Array.from({ length: corners + 1 }, (_, j) => at(from + (j * step) / corners, 100));
    return {
      type,
      style: {
        background: type ? TOUR_TYPE_COLORS[type] : undefined,
        clipPath:
          n > 1 ? `polygon(50% 50%, ${arc.map((p) => `${p.x}% ${p.y}%`).join(', ')})` : undefined,
      } as CSSProperties,
      iconStyle: {
        left: `${icon.x}%`,
        top: `${icon.y}%`,
        fontSize: type ? `${ICON_PX[k]}px` : undefined,
      } as CSSProperties,
    };
  });
  const seams = n > 1 ? drawn.map((_, i) => START_DEG + (i * 360) / n) : [];
  return (
    <span className={join(c('type-badge'), className)} aria-hidden="true">
      <span className={c('disc')}>
        {!types.length && <BaseIcon name="location_on" size="lg" />}
        {slices.map((slice) => (
          <span key={slice.type ?? 'more'} className={c('slice')} style={slice.style}>
            {slice.type ? (
              <BaseIcon
                name={TOUR_TYPE_ICONS[slice.type]}
                className={c('slice-icon')}
                style={slice.iconStyle}
              />
            ) : (
              <span className={c('slice-icon slice-more')} style={slice.iconStyle}>
                +{more}
              </span>
            )}
          </span>
        ))}
        {/* Seams in the card colour keep two same-colour activities apart. */}
        {seams.map((deg) => (
          <span key={deg} className={c('seam')} style={{ transform: `rotate(${deg}deg)` }} />
        ))}
      </span>
      {children}
    </span>
  );
}
