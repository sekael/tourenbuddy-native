import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { classes } from '@/core/web/classes';

import styles from './calendar-feed-help.module.css';

const c = classes(styles);
type Provider = 'google' | 'outlook' | 'icloud';
// Google first: the embed-link mix-up it prevents is the one users actually hit.
const TABS: { id: Provider; stepCount: number }[] = [
  { id: 'google', stepCount: 4 },
  { id: 'outlook', stepCount: 3 },
  { id: 'icloud', stepCount: 3 },
];

/** Where each provider hides its secret iCal address. */
export function CalendarFeedHelp() {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const [active, setActive] = useState<Provider>('google');
  const tab = TABS.find((x) => x.id === active)!;
  return (
    <details className={c('help')}>
      <summary className={c('summary')}>{t('calendar.sync.help.summary')}</summary>
      <div
        className={c('tabs')}
        role="tablist"
        data-tab-indicator
        style={
          {
            '--tab-index': TABS.findIndex((x) => x.id === active),
            '--tab-count': TABS.length,
          } as CSSProperties
        }
      >
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            className={c('tab')}
            aria-selected={active === x.id}
            onClick={() => setActive(x.id)}
          >
            {tk(`calendar.sync.help.${x.id}`)}
          </button>
        ))}
      </div>
      <ol className={c('steps')} role="tabpanel">
        {Array.from({ length: tab.stepCount }, (_, i) => (
          <li key={i}>{tk(`calendar.sync.help.${tab.id}Step${i + 1}`)}</li>
        ))}
      </ol>
    </details>
  );
}
