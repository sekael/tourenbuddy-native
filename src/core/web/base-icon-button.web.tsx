import type { ButtonHTMLAttributes } from 'react';

import styles from './base-icon-button.module.css';
import { BaseIcon } from './base-icon.web';
import { classes, join } from './classes';
import { useIsDesktop } from './use-media-query.web';

const c = classes(styles);

type Size = 'sm' | 'md' | 'lg';

/** The PWA's `<BaseIconButton>`: a glyph with an accessible name, a tooltip on desktop. */
export function BaseIconButton({
  name,
  label,
  size = 'md',
  shape = 'round',
  tone = 'default',
  variant = 'standard',
  className,
  ref,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'name'> & {
  name: string;
  label: string;
  size?: Size;
  shape?: 'round' | 'square';
  tone?: 'default' | 'danger';
  variant?: 'standard' | 'tonal';
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const isDesktop = useIsDesktop();
  return (
    <button
      ref={ref}
      type="button"
      className={join(
        c(
          'base-icon-button',
          `base-icon-button--${size}`,
          `base-icon-button--${shape}`,
          `base-icon-button--${tone}`,
          `base-icon-button--${variant}`,
        ),
        className,
      )}
      aria-label={label}
      title={isDesktop ? label : undefined}
      {...rest}
    >
      <BaseIcon name={name} size={size} />
    </button>
  );
}
