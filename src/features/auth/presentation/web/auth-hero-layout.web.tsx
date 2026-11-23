import type { ReactNode } from 'react';

import { classes } from '@/core/web/classes';

import styles from './auth-hero-layout.module.css';

const c = classes(styles);

/** The PWA's sign-in backdrop: the mountain photo, the title and a card for the form. */
export function AuthHeroLayout({ children }: { children: ReactNode }) {
  return (
    <div className={c('auth-hero')}>
      <picture className={c('background')}>
        <source media="(max-width: 768px)" srcSet="/app/background-mobile.webp" />
        <img src="/app/background-desktop.webp" alt="" aria-hidden="true" />
      </picture>
      <div className={c('overlay')} aria-hidden="true" />
      <div className={c('content')}>
        <h1 className={c('hero-title')}>TourenBuddy</h1>
        <div className={c('card')}>{children}</div>
      </div>
    </div>
  );
}
