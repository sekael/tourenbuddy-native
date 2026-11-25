import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import {
  outboundUrl as outboundUrlOf,
  useCalendarFeedStore,
} from '@/features/calendar/presentation/stores/calendar-feed-store';

import styles from './calendar-outbound-feed.module.css';

const c = classes(styles);

/** The user's own TourenBuddy feed for other calendars: copy it, or replace it. */
export function CalendarOutboundFeed() {
  const { t } = useTranslation('web');
  const outboundUrl = useCalendarFeedStore((s) => outboundUrlOf(s.settings));
  const [copied, setCopied] = useState(false);
  // Two-step in place instead of a modal: the old URL dies immediately.
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    if (!outboundUrl) return;
    await navigator.clipboard.writeText(outboundUrl);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  if (!outboundUrl) return null;
  return (
    <div className={c('outbound')}>
      <h3 className={c('group-title')}>{t('calendar.sync.outboundTitle')}</h3>
      <p className={c('hint')}>{t('calendar.sync.outboundHint')}</p>
      <div className={c('url-row')}>
        <input
          className={c('url')}
          value={outboundUrl}
          readOnly
          aria-label={t('calendar.sync.outboundTitle')}
          onFocus={(e) => e.target.select()}
        />
        <BaseButton variant="secondary" onClick={() => void copy()}>
          <BaseIcon name="content_copy" />
          {copied ? t('calendar.sync.copied') : t('calendar.sync.copy')}
        </BaseButton>
      </div>
      {confirming ? (
        <div className={c('confirm')} role="alert">
          <span>{t('calendar.sync.regenerateConfirm')}</span>
          <BaseButton variant="secondary" onClick={() => setConfirming(false)}>
            {t('calendar.availability.cancel')}
          </BaseButton>
          <BaseButton
            variant="danger"
            onClick={() => {
              setConfirming(false);
              void useCalendarFeedStore.getState().regenerateToken();
            }}
          >
            {t('calendar.sync.regenerate')}
          </BaseButton>
        </div>
      ) : (
        <>
          <p className={c('hint')}>{t('calendar.sync.regenerateHint')}</p>
          <BaseButton
            variant="secondary"
            className={c('regenerate')}
            onClick={() => setConfirming(true)}
          >
            <BaseIcon name="replay" />
            {t('calendar.sync.regenerate')}
          </BaseButton>
        </>
      )}
    </div>
  );
}
