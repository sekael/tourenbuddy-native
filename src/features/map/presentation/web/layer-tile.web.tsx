import type { AriaAttributes, AriaRole, CSSProperties } from 'react';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { Transition } from '@/core/web/transition.web';

import styles from './layer-tile.module.css';

const c = classes(styles);

/** A preview tile in the map layers panel; the caller sets the ARIA role and state. */
export function LayerTile({
  label,
  thumbnail,
  icon,
  iconColor,
  selected,
  disabled,
  onSelect,
  role,
  tabIndex,
  ...aria
}: {
  label: string;
  thumbnail: string;
  icon?: string;
  iconColor?: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  role?: AriaRole;
  tabIndex?: number;
} & AriaAttributes) {
  return (
    <button
      type="button"
      className={c('tile', { selected })}
      disabled={disabled}
      onClick={onSelect}
      role={role}
      tabIndex={tabIndex}
      {...aria}
    >
      <span className={c('thumb')}>
        <img src={thumbnail} alt="" width={72} height={72} />
        {icon && (
          <span
            className={c('chip')}
            style={{ backgroundColor: iconColor } as CSSProperties}
            aria-hidden="true"
          >
            <BaseIcon name={icon} size="xs" />
          </span>
        )}
        <Transition name="badge" cls={c}>
          {selected && (
            <span className={c('badge')} aria-hidden="true">
              <BaseIcon name="check" size="xs" />
            </span>
          )}
        </Transition>
      </span>
      <span className={c('label')}>{label}</span>
    </button>
  );
}
