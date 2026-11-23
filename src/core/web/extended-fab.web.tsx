import type { ReactNode } from 'react';

import { classes } from './classes';
import styles from './extended-fab.module.css';

const c = classes(styles);

/** Extended FAB: the primary action floating over a page. */
export function ExtendedFab({
  label,
  icon,
  disabled,
  className,
  onClick,
  ...rest
}: {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  'data-tour'?: string;
}) {
  return (
    <button className={c('ext-fab', className)} disabled={disabled} onClick={onClick} {...rest}>
      {icon}
      <span className={c('ext-fab-label')}>{label}</span>
    </button>
  );
}
