import type { ButtonHTMLAttributes } from 'react';

import styles from './base-button.module.css';
import { classes, join } from './classes';

const c = classes(styles);

const VARIANTS = [
  'primary',
  'primary-outline',
  'secondary',
  'danger',
  'danger-outline',
  'text',
] as const;
const SIZES = ['sm', 'md', 'lg'] as const;
export type ButtonVariant = (typeof VARIANTS)[number];
export type ButtonSize = (typeof SIZES)[number];

/** The PWA's `<BaseButton>`: variant and size from a whitelist, the rest falls through. */
export function BaseButton({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const v = VARIANTS.includes(variant) ? variant : 'primary';
  const s = SIZES.includes(size) ? size : 'md';
  return (
    <button
      ref={ref}
      // The PWA defaults to `type="button"`; forms pass `submit`.

      type={type}
      className={join(c('base-button', `base-button--${v}`, `base-button--${s}`), className)}
      {...rest}
    />
  );
}
