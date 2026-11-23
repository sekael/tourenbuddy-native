import type { ReactNode } from 'react';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useIsDesktop } from '@/core/web/use-media-query.web';

import styles from './speed-dial-item.module.css';

const c = classes(styles);

/** One glass pill per action in the speed-dial menu: label, then icon. */
export function SpeedDialItem({
  icon,
  label,
  disabled,
  tooltip,
  badge,
  onSelect,
  ...rest
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  tooltip?: string;
  badge?: ReactNode;
  onSelect: () => void;
  'data-tour'?: string;
}) {
  const isDesktop = useIsDesktop();
  return (
    <button
      type="button"
      role="menuitem"
      className={c('item-row fab-glass')}
      disabled={disabled}
      aria-disabled={disabled}
      title={isDesktop ? (tooltip ?? label) : undefined}
      aria-label={tooltip ?? label}
      onClick={onSelect}
      {...rest}
    >
      <span className={c('label')}>{label}</span>
      <span className={c('icon-wrap')}>
        {badge}
        <BaseIcon name={icon} className={c('icon')} />
      </span>
    </button>
  );
}
