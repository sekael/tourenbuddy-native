import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { classes } from '@/core/web/classes';

import styles from './contact-import-help.module.css';

const c = classes(styles);
type Platform = 'ios' | 'android' | 'desktop';
const TABS: { id: Platform; label: string }[] = [
  { id: 'ios', label: 'contacts.addDialog.help.tabIos' },
  { id: 'android', label: 'contacts.addDialog.help.tabAndroid' },
  { id: 'desktop', label: 'contacts.addDialog.help.tabDesktop' },
];
const STEP_COUNT = 4;

/**
 * How to export contacts as a .vcf, per platform. iOS leads unconditionally (no UA sniffing):
 * it has no Contact Picker fallback, so the file is its only path.
 */
export function ContactImportHelp() {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const [activeTab, setActiveTab] = useState<Platform>('ios');
  return (
    <details className={c('import-help')}>
      <summary className={c('import-help-summary')}>{t('contacts.addDialog.help.summary')}</summary>
      <div
        className={c('tabs')}
        role="tablist"
        data-tab-indicator
        style={
          {
            '--tab-index': TABS.findIndex((tab) => tab.id === activeTab),
            '--tab-count': TABS.length,
          } as CSSProperties
        }
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={c('tab')}
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tk(tab.label)}
          </button>
        ))}
      </div>
      <ol className={c('steps')} role="tabpanel">
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <li key={i}>{tk(`contacts.addDialog.help.${activeTab}Step${i + 1}`)}</li>
        ))}
      </ol>
    </details>
  );
}
