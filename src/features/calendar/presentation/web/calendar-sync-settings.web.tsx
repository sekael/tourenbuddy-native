import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';

import { CalendarFeedHelp } from './calendar-feed-help.web';
import { CalendarFeedRow } from './calendar-feed-row.web';
import { CalendarOutboundFeed } from './calendar-outbound-feed.web';
import styles from './calendar-sync-settings.module.css';

const c = classes(styles);
const MAX_FEEDS = 5;
const MIN_FREE_OPTIONS = [180, 240, 300, 360, 420, 480, 540, 600];

/** Calendar sync in the profile: connected feeds, the free-day window, the outbound feed. */
export function CalendarSyncSettings() {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const feeds = useCalendarFeedStore((s) => s.feeds);
  const settings = useCalendarFeedStore((s) => s.settings);
  const loading = useCalendarFeedStore((s) => s.loading);
  const syncing = useCalendarFeedStore((s) => s.syncing);
  const error = useCalendarFeedStore((s) => s.error);
  const store = useCalendarFeedStore.getState();
  const hasFeeds = feeds.length > 0;

  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [coreStart, setCoreStart] = useState('06:00');
  const [coreEnd, setCoreEnd] = useState('18:00');
  const [minFree, setMinFree] = useState(360);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Seed the window form from the server once settings arrive (and after a save round-trips).
  useEffect(() => {
    if (!settings) return;
    setCoreStart(settings.coreStart);
    setCoreEnd(settings.coreEnd);
    setMinFree(settings.minFreeMinutes);
  }, [settings]);

  // Save only when the form differs from the backend; confirm in place once applied.
  const dirty =
    !!settings &&
    (coreStart !== settings.coreStart ||
      coreEnd !== settings.coreEnd ||
      minFree !== settings.minFreeMinutes);
  useEffect(() => {
    if (dirty) setSaved(false);
  }, [dirty]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await store.addFeed(newUrl, newLabel)) {
      setNewUrl('');
      setNewLabel('');
    }
  }

  async function saveWindow(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      setSaved(await store.saveSettings({ coreStart, coreEnd, minFreeMinutes: minFree }));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void useCalendarFeedStore.getState().load();
    // The store outlives the sheet: an action error must not greet the next visit.
    return () => useCalendarFeedStore.setState({ error: null });
  }, []);

  return (
    <section className={c('calendar-sync')}>
      {loading && !settings ? (
        <div className={c('loading-placeholder')} />
      ) : (
        <>
          <div className={c('group')}>
            <h3 className={c('group-title')}>{t('calendar.sync.feedsTitle')}</h3>
            <p className={c('hint')}>{t('calendar.sync.hint')}</p>
            {hasFeeds && (
              <ul className={c('feeds')}>
                {feeds.map((feed) => (
                  <CalendarFeedRow
                    key={feed.id}
                    feed={feed}
                    onRemove={() => void store.removeFeed(feed.id)}
                    onRelabel={(label) => void store.relabelFeed(feed.id, label)}
                  />
                ))}
              </ul>
            )}
            {hasFeeds && (
              <BaseButton variant="secondary" disabled={syncing} onClick={() => void store.sync()}>
                <BaseIcon name="sync_alt" />
                {syncing ? t('calendar.sync.syncing') : t('calendar.sync.syncNow')}
              </BaseButton>
            )}
            {feeds.length < MAX_FEEDS ? (
              <form className={c('add-form')} onSubmit={(e) => void add(e)}>
                <input
                  value={newUrl}
                  className={c('input')}
                  type="url"
                  inputMode="url"
                  required
                  placeholder={t('calendar.sync.urlPlaceholder')}
                  aria-label={t('calendar.sync.urlPlaceholder')}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
                <CalendarFeedHelp />
                <input
                  value={newLabel}
                  className={c('input')}
                  maxLength={60}
                  placeholder={t('calendar.sync.labelPlaceholder')}
                  aria-label={t('calendar.sync.labelPlaceholder')}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <BaseButton type="submit" disabled={syncing}>
                  {t('calendar.sync.addFeed')}
                </BaseButton>
              </form>
            ) : (
              <p className={c('hint')}>{t('calendar.sync.errors.limit')}</p>
            )}
            {error && (
              <p className={c('error')} role="alert">
                {tk(`calendar.sync.errors.${error}`)}
              </p>
            )}
          </div>

          {settings && (
            <form className={c('window-form')} onSubmit={(e) => void saveWindow(e)}>
              <h3 className={c('group-title')}>{t('calendar.sync.windowTitle')}</h3>
              <label className={c('field')}>
                {t('calendar.sync.coreStart')}
                <input
                  value={coreStart}
                  className={c('input')}
                  type="time"
                  required
                  onChange={(e) => setCoreStart(e.target.value)}
                />
              </label>
              <label className={c('field')}>
                {t('calendar.sync.coreEnd')}
                <input
                  value={coreEnd}
                  className={c('input')}
                  type="time"
                  required
                  onChange={(e) => setCoreEnd(e.target.value)}
                />
              </label>
              <label className={c('field')}>
                {t('calendar.sync.minFree')}
                <span className={c('select-wrap')}>
                  <select
                    value={minFree}
                    className={c('input select')}
                    onChange={(e) => setMinFree(Number(e.target.value))}
                  >
                    {MIN_FREE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {t('calendar.sync.hours', { n: m / 60 })}
                      </option>
                    ))}
                  </select>
                  <BaseIcon name="expand_more" className={c('select-chevron')} />
                </span>
              </label>
              <BaseButton
                type="submit"
                className={c('save-window', { 'save-window--saved': saved && !dirty })}
                disabled={!dirty || saving || syncing}
              >
                <span role="status">
                  {saving ? (
                    t('calendar.sync.savingWindow')
                  ) : saved && !dirty ? (
                    <>
                      <BaseIcon name="check" /> {t('calendar.sync.savedWindow')}
                    </>
                  ) : (
                    t('calendar.sync.saveWindow')
                  )}
                </span>
              </BaseButton>
            </form>
          )}

          <CalendarOutboundFeed />
        </>
      )}
    </section>
  );
}
