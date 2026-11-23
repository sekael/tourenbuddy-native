import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';

import styles from './calendar-nav.module.css';

const c = classes(styles);
export type CalendarView = 'planned' | 'seasons';

const ITEMS: {
  view: CalendarView;
  icon: string;
  label: 'calendar.nav.planned' | 'calendar.nav.seasons';
}[] = [
  { view: 'planned', icon: 'calendar_today', label: 'calendar.nav.planned' },
  { view: 'seasons', icon: 'wb_sunny', label: 'calendar.nav.seasons' },
];

/** Planned · Seasons: a sidebar on desktop, a bottom bar on phones (CSS picks one). */
export function CalendarNav({
  active,
  onSelect,
}: {
  active: CalendarView;
  onSelect: (view: CalendarView) => void;
}) {
  const { t } = useTranslation('web');
  const item = (cls: string) =>
    ITEMS.map(({ view, icon, label }) => (
      <button
        key={view}
        type="button"
        className={c(cls, { [`${cls}--active`]: active === view })}
        aria-current={active === view ? 'page' : undefined}
        data-tour={view === 'seasons' ? 'nav-seasons' : 'nav-planned'}
        onClick={() => onSelect(view)}
      >
        <BaseIcon name={icon} />
        <span>{t(label)}</span>
      </button>
    ));
  return (
    <>
      <aside className={c('sidebar')}>
        <div className={c('sidebar-brand')}>
          <h1 className={c('brand-title')}>{t('calendar.title')}</h1>
          <p className={c('brand-subtitle')}>{t('calendar.subtitle')}</p>
        </div>
        <nav className={c('sidebar-nav')}>{item('nav-item')}</nav>
      </aside>
      <nav className={c('bottom-nav')}>{item('bottom-nav-item')}</nav>
    </>
  );
}
