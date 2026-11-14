import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Share } from 'react-native';

import {
  ContentRow,
  DateRow,
  ListRow,
  ListSection,
  PickerRow,
  StepperRow,
  TextRow,
} from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { useFormatter } from '@/core/i18n/format';
import { color } from '@/core/theme/tokens';
import type { CalendarFeed } from '@/features/calendar/domain/repositories/calendar-feed-repository';

import { outboundUrl, useCalendarFeedStore } from './stores/calendar-feed-store';

/** "HH:MM" ↔ a Date on an arbitrary day, for the time pickers. */
const toDate = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m);
};
const toHhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

function feedErrorText(t: TFunction, code: string) {
  const http = /^http_(\d{3})$/.exec(code);
  if (http) {
    const status = Number(http[1]);
    return status >= 500
      ? t('calendar.sync.feedError.httpServer', { status })
      : t('calendar.sync.feedError.http', { status });
  }
  const known = ['timeout', 'network', 'too_large', 'unparseable', 'too_complex'];
  return t(`calendar.sync.feedError.${known.includes(code) ? code : 'unknown'}` as never);
}

/**
 * Calendar sync (calendar-sync): the user's own iCal feeds that mark busy days, when a day counts
 * as free, and the private link that puts their tours into their calendar app.
 */
export function CalendarSyncPage({ onHelp }: { onHelp: () => void }) {
  const { t } = useTranslation();
  const { formatDate } = useFormatter();
  const feeds = useCalendarFeedStore((s) => s.feeds);
  const settings = useCalendarFeedStore((s) => s.settings);
  const syncing = useCalendarFeedStore((s) => s.syncing);
  const error = useCalendarFeedStore((s) => s.error);
  const store = useCalendarFeedStore.getState();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const link = outboundUrl(settings);

  useEffect(() => {
    void useCalendarFeedStore.getState().load();
  }, []);

  async function add() {
    setAdding(true);
    if (await store.addFeed(url, label)) {
      setUrl('');
      setLabel('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setAdding(false);
  }

  const saveWindow = (patch: Partial<NonNullable<typeof settings>>) => {
    if (!settings) return;
    const { feedToken: _token, ...window } = { ...settings, ...patch };
    void store.saveSettings(window);
  };

  const feedRow = (feed: CalendarFeed) => (
    <ListRow
      key={feed.id}
      title={feed.label || feed.host}
      subtitle={
        feed.lastError
          ? feedErrorText(t, feed.lastError)
          : feed.lastSyncedAt
            ? t('calendar.sync.lastSynced', {
                when: formatDate(new Date(feed.lastSyncedAt), {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : t('calendar.sync.neverSynced')
      }
      icon={feed.lastError ? 'warning' : 'calendar_today'}
      iconColor={feed.lastError ? color.error : undefined}
      menu={[
        {
          label: t('calendar.sync.label'),
          icon: 'edit',
          onPress: () =>
            Alert.prompt?.(
              t('calendar.sync.label'),
              feed.host,
              (next) => void store.relabelFeed(feed.id, next),
              'plain-text',
              feed.label ?? '',
            ),
        },
        {
          label: t('calendar.sync.removeFeed', { host: feed.host }),
          icon: 'delete',
          destructive: true,
          onPress: () => void store.removeFeed(feed.id),
        },
      ]}
    />
  );

  return (
    <Page title={t('calendar.sync.title')} onRefresh={store.load}>
      <ListSection
        title={t('calendar.sync.feedsTitle')}
        footer={error ? t(`calendar.sync.errors.${error}`) : t('calendar.sync.hint')}
      >
        {feeds.map(feedRow)}
        {feeds.length ? (
          <ListRow
            title={syncing ? t('calendar.sync.syncing') : t('calendar.sync.syncNow')}
            icon="sync_alt"
            chevron={false}
            disabled={syncing}
            onPress={() => void store.sync()}
          />
        ) : null}
      </ListSection>
      <ListSection title={t('calendar.sync.addSection')}>
        <TextRow
          label={t('calendar.sync.urlPlaceholder')}
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoCapitalize="none"
          textContentType="URL"
        />
        <TextRow
          label={t('calendar.sync.label')}
          placeholder={t('calendar.sync.labelPlaceholder')}
          value={label}
          onChangeText={setLabel}
          autoCapitalize="words"
        />
        <ListRow
          title={t('calendar.sync.addFeed')}
          icon="add"
          chevron={false}
          disabled={adding || !url.trim()}
          onPress={() => void add()}
        />
        <ListRow title={t('calendar.sync.help.summary')} icon="help" onPress={onHelp} />
      </ListSection>
      {settings ? (
        <ListSection title={t('calendar.sync.windowTitle')}>
          <DateRow
            title={t('calendar.sync.coreStart')}
            mode="time"
            value={toDate(settings.coreStart)}
            onChange={(date) => saveWindow({ coreStart: toHhmm(date) })}
          />
          <DateRow
            title={t('calendar.sync.coreEnd')}
            mode="time"
            value={toDate(settings.coreEnd)}
            onChange={(date) => saveWindow({ coreEnd: toHhmm(date) })}
          />
          <StepperRow
            title={t('calendar.sync.minFree')}
            value={settings.minFreeMinutes / 60}
            min={1}
            max={12}
            onChange={(hours) => saveWindow({ minFreeMinutes: hours * 60 })}
            format={(hours) => t('calendar.sync.hours', { n: hours })}
          />
        </ListSection>
      ) : null}
      {link ? (
        <ListSection
          title={t('calendar.sync.outboundTitle')}
          footer={t('calendar.sync.outboundHint')}
        >
          <ListRow
            title={t('calendar.sync.copy')}
            icon="content_copy"
            chevron={false}
            onPress={() => {
              void Clipboard.setStringAsync(link);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
          />
          <ListRow
            title={t('calendar.sync.share')}
            icon="share"
            chevron={false}
            onPress={() => void Share.share({ url: link, message: link })}
          />
          <ListRow
            title={t('calendar.sync.regenerate')}
            icon="replay"
            destructive
            onPress={() =>
              Alert.alert(t('calendar.sync.regenerate'), t('calendar.sync.regenerateConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('calendar.sync.regenerate'),
                  style: 'destructive',
                  onPress: () => void store.regenerateToken(),
                },
              ])
            }
          />
        </ListSection>
      ) : null}
    </Page>
  );
}

const PROVIDERS = { icloud: 3, google: 4, outlook: 3 } as const;
type Provider = keyof typeof PROVIDERS;

/**
 * Where a calendar's iCal address lives (calendar-sync "feed help"), per provider. iOS leads with
 * iCloud, the others with Google, whose embed-link mix-up is the one users hit.
 */
export function CalendarFeedHelpPage() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<Provider>(Platform.OS === 'ios' ? 'icloud' : 'google');
  const order: Provider[] =
    Platform.OS === 'ios' ? ['icloud', 'google', 'outlook'] : ['google', 'outlook', 'icloud'];
  const steps = Array.from({ length: PROVIDERS[provider] }, (_, i) =>
    t(`calendar.sync.help.${provider}Step${i + 1}` as never),
  );

  return (
    <Page title={t('calendar.sync.help.summary')}>
      <ListSection>
        <PickerRow
          style="segmented"
          title={t('calendar.sync.help.provider')}
          value={provider}
          options={order.map((p) => ({ value: p, label: t(`calendar.sync.help.${p}`) }))}
          onChange={setProvider}
        />
        {steps.map((step, i) => (
          <ContentRow key={`${provider}${i}`}>
            <Text>{`${i + 1}. ${step}`}</Text>
          </ContentRow>
        ))}
      </ListSection>
    </Page>
  );
}
