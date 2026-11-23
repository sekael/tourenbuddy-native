import { createLogger } from '@/core/logging/logger';

import styles from './base-icon.module.css';
import { classes, join } from './classes';
import { iconData } from './icon-data.web';

const c = classes(styles);
const log = createLogger('BaseIcon');

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * The PWA's `<BaseIcon>`: a registry icon as inline SVG, 1.2em square, so the font size drives it.
 * An empty name renders nothing; an unknown one is a bug, logged in development.
 */
export function BaseIcon({
  name,
  size,
  className,
  style,
}: {
  name: string;
  size?: IconSize;
  className?: string;
  style?: React.CSSProperties;
}) {
  const icon = iconData[name];
  if (!icon) {
    if (__DEV__ && name) log.error(`Unknown icon name "${name}" — register it in icon-data.web.ts`);
    return null;
  }
  return (
    <svg
      className={join(c('base-icon', size && `base-icon--${size}`), className)}
      viewBox={icon[0]}
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: icon[1] }}
    />
  );
}
