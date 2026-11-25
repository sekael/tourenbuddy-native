import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import type { CalendarFeed } from '@/features/calendar/domain/repositories/calendar-feed-repository';

import styles from './calendar-feed-row.module.css';

const c = classes(styles);
const KNOWN_ERRORS = ['timeout', 'network', 'too_large', 'unparseable', 'too_complex'];

/** One connected feed: its label (editable), host, and last sync or error. */
export function CalendarFeedRow({
  feed,
  onRemove,
  onRelabel,
}: {
  feed: CalendarFeed;
  onRemove: () => void;
  onRelabel: (label: string) => void;
}) {
  const { t, i18n } = useTranslation('web');
  const tk = t as unknown as (key: string, params?: Record<string, unknown>) => string;
  const { formatDate } = useFormatter();

  // Worker codes: `http_<status>` or a fixed set; anything else reads as generic.
  const errorText = (() => {
    const code = feed.lastError;
    if (!code) return null;
    const http = /^http_(\d{3})$/.exec(code);
    if (http)
      return tk(`calendar.sync.feedError.${http[1]! >= '500' ? 'httpServer' : 'http'}`, {
        status: http[1],
      });
    const key = `calendar.sync.feedError.${code}`;
    return KNOWN_ERRORS.includes(code) && i18n.exists(key, { ns: 'web' })
      ? tk(key)
      : t('calendar.sync.feedError.unknown');
  })();
  const syncedText = feed.lastSyncedAt
    ? t('calendar.sync.lastSynced', {
        when: formatDate(feed.lastSyncedAt, { dateStyle: 'short', timeStyle: 'short' }),
      })
    : t('calendar.sync.neverSynced');

  function onLabelChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    if (value.trim() !== (feed.label ?? '')) onRelabel(value);
  }

  return (
    <li className={c('feed', { 'feed--error': errorText })}>
      <div className={c('feed-main')}>
        {/* Uncontrolled, committed on blur like the PWA's `@change`. */}
        <input
          key={feed.label ?? ''}
          className={c('label-input')}
          defaultValue={feed.label ?? ''}
          placeholder={t('calendar.sync.label')}
          aria-label={t('calendar.sync.labelAria', { host: feed.host })}
          maxLength={60}
          onBlur={onLabelChange}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {/* Host only: the full URL is a bearer credential. */}
        <span className={c('host')}>{feed.host}</span>
        {errorText ? (
          <span className={c('status status--error')} role="status">
            <BaseIcon name="warning" />
            {errorText}
          </span>
        ) : (
          <span className={c('status')}>{syncedText}</span>
        )}
      </div>
      <BaseIconButton
        name="delete"
        tone="danger"
        size="sm"
        label={t('calendar.sync.removeFeed', { host: feed.host })}
        onClick={onRemove}
      />
    </li>
  );
}
