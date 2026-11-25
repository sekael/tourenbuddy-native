import { useImperativeHandle, useRef, type ReactNode } from 'react';

import { BaseIcon } from './base-icon.web';
import { classes, join } from './classes';
import styles from './search-input.module.css';

const c = classes(styles);

export type SearchInputHandle = {
  blur: () => void;
  focus: () => void;
  el: () => HTMLElement | null;
};

/** Search box: icon and native `type="search"` input, plus trailing controls on the same row. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
  onEnter,
  onEscape,
  onFocus,
  onBlur,
  children,
  ref,
  'data-testid': testId,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  onEnter?: () => void;
  onEscape?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  children?: ReactNode;
  ref?: React.Ref<SearchInputHandle>;
  'data-testid'?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    blur: () => input.current?.blur(),
    focus: () => input.current?.focus(),
    el: () => row.current,
  }));
  return (
    <div
      ref={row}
      className={join(c('search-row'), className)}
      data-testid={testId}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <BaseIcon name="search" className={c('search-icon')} />
      <input
        ref={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="search"
        className={c('search-input')}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter?.();
          } else if (e.key === 'Escape') onEscape?.();
        }}
      />
      {children}
    </div>
  );
}
