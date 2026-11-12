import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import type { IconName } from '@/core/adaptive/icons';
import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { useFormatter } from '@/core/i18n/format';
import { color, space } from '@/core/theme/tokens';
import { findReleaseNote, type ReleaseNote } from '@/features/notifications/data/release-notes';
import type {
  InboxNotification,
  InboxStaleReason,
} from '@/features/notifications/domain/entities/inbox-notification';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import { canOpenTour, openInboxEntry, targetTourId } from './inbox-navigation';
import { inboxText, summaryFriendIds } from './inbox-text';
import { useInboxStore } from './stores/inbox-store';

/** Requests and batches resolved elsewhere make their entry stale. */
const PENDING_SUBJECT: Record<string, 'friend' | 'batch' | 'link'> = {
  received: 'friend',
  suggestion_submitted: 'batch',
  suggestion_revised: 'batch',
  link_created: 'link',
};

/**
 * Why an entry no longer needs attention (notification-inbox D7): its request answered, its
 * suggestions resolved, its tour gone. Nothing is stale until the source has loaded once.
 */
export function useInboxStaleness() {
  const ready = useInboxStore((s) => s.ready);
  const incoming = useFriendshipsStore((s) => s.incoming);
  const suggestions = useTourSuggestionsStore((s) => s.suggestions);
  const linkRequests = useTourLinksStore((s) => s.pendingRequests);
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);

  const friendsReady = ready.friends || incoming.length > 0;
  const batchesReady = ready.batches || suggestions.length > 0;
  const linksReady = ready.links || linkRequests.length > 0;
  const toursReady = ready.tours || tours.length + friendTours.length > 0;

  return (entry: InboxNotification): InboxStaleReason | null => {
    const subject = PENDING_SUBJECT[entry.action];
    const ref = (key: string) =>
      typeof entry.ref[key] === 'string' ? (entry.ref[key] as string) : '';
    if (
      subject === 'friend' &&
      friendsReady &&
      !incoming.some((r) => r.status === 'pending' && r.id === ref('request_id'))
    ) {
      return 'answered';
    }
    if (
      subject === 'batch' &&
      batchesReady &&
      !suggestions.some((s) => s.status === 'pending' && s.batchId === ref('batch_id'))
    ) {
      return 'resolved';
    }
    if (
      subject === 'link' &&
      linksReady &&
      !linkRequests.some((r) => r.status === 'pending' && r.id === ref('request_id'))
    ) {
      return 'resolved';
    }
    const tourId = targetTourId(entry);
    if (tourId && entry.action !== 'deleted' && toursReady && !canOpenTour(tourId))
      return 'tourGone';
    return null;
  };
}

/** Unread and still actionable: what the badges count. */
export function useInboxAttention() {
  const entries = useInboxStore((s) => s.entries);
  const stale = useInboxStaleness();
  return entries.filter((e) => e.readAt === null && stale(e) === null).length;
}

const TYPE_ICONS: Record<string, IconName> = {
  friend_requests: 'person_add',
  tour_updates: 'tour',
  tour_interest: 'link',
  tour_suggestions: 'edit',
  availability: 'event_available',
  tour_reminders: 'schedule',
  release_notes: 'auto_awesome',
};

/** The inbox (notification-inbox) as a sheet: entries newest first, a release note pushed in. */
export function InboxSheet() {
  const [path, setPath] = useState<string[]>([]);
  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(value) => {
        const note = value.startsWith('note:') ? findReleaseNote(value.slice(5)) : null;
        return note ? <ReleaseNotePage note={note} /> : null;
      }}
    >
      <InboxPage onNote={(id) => setPath((p) => [...p, `note:${id}`])} />
    </Screen>
  );
}

function InboxPage({ onNote }: { onNote: (id: string) => void }) {
  const { t } = useTranslation();
  const { formatDate } = useFormatter();
  const entries = useInboxStore((s) => s.entries);
  const hasMore = useInboxStore((s) => s.hasMore);
  const isLoading = useInboxStore((s) => s.isLoading);
  const names = useFriendshipsStore((s) => s.userIdToNamesMap);
  const stale = useInboxStaleness();
  const store = useInboxStore.getState();

  useEffect(() => {
    if (!useInboxStore.getState().entries.length) void useInboxStore.getState().load();
  }, []);

  const firstFriendIds = [...new Set(entries.flatMap((e) => summaryFriendIds(e).slice(0, 1)))].join(
    ',',
  );
  useEffect(() => {
    if (firstFriendIds)
      void useFriendshipsStore.getState().getNamesByUserIds(firstFriendIds.split(','));
  }, [firstFriendIds]);

  const friendName = (entry: InboxNotification) => {
    const id = summaryFriendIds(entry)[0];
    const entryName = id ? names.get(id) : undefined;
    return entryName
      ? `${entryName.firstName ?? ''} ${entryName.lastName ?? ''}`.trim() || null
      : null;
  };

  function open(entry: InboxNotification) {
    void store.markRead(entry.id);
    const note = entry.type === 'release_notes' ? findReleaseNote(entry.ref.note_id) : null;
    if (note) onNote(note.id);
    else void openInboxEntry(entry, t);
  }

  const confirmClear = () =>
    Alert.alert(t('inbox.clearConfirm'), undefined, [
      { text: t('inbox.cancel'), style: 'cancel' },
      {
        text: t('inbox.clearAllConfirm'),
        style: 'destructive',
        onPress: () => void store.clearAll(),
      },
    ]);

  return (
    <Page
      title={t('inbox.title')}
      onClose={() => router.back()}
      onRefresh={store.load}
      actions={
        entries.length
          ? [
              {
                id: 'more',
                label: t('common.more'),
                icon: 'menu',
                menu: [
                  {
                    label: t('inbox.markAllRead'),
                    icon: 'check',
                    onPress: () => void store.markAllRead(),
                  },
                  {
                    label: t('inbox.clearAll'),
                    icon: 'delete',
                    destructive: true,
                    onPress: confirmClear,
                  },
                ],
              },
            ]
          : undefined
      }
    >
      {entries.length === 0 ? (
        <EmptyState icon="inbox" title={t('inbox.empty')} />
      ) : (
        <ListSection>
          {entries.map((entry) => {
            const reason = stale(entry);
            const unread = !entry.readAt && !reason;
            const when = formatDate(new Date(entry.createdAt), {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <ListRow
                key={entry.id}
                title={inboxText(entry, t as never, friendName(entry))}
                subtitle={[
                  when,
                  entry.occurrences > 1
                    ? t('inbox.occurrences', { count: entry.occurrences })
                    : null,
                  reason ? t(`inbox.stale.${reason}`) : unread ? t('inbox.state.unread') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                icon={reason ? 'history' : (TYPE_ICONS[entry.type] ?? 'notifications')}
                iconColor={unread ? color.primary : color.onSurfaceVariant}
                onPress={() => open(entry)}
                swipeActions={[
                  {
                    label: t('inbox.delete'),
                    icon: 'delete',
                    destructive: true,
                    onPress: () => void store.remove(entry.id),
                  },
                ]}
              />
            );
          })}
          {hasMore ? (
            <ListRow
              title={t('inbox.loadMore')}
              icon="expand_more"
              chevron={false}
              disabled={isLoading}
              onPress={() => void store.loadMore()}
            />
          ) : null}
        </ListSection>
      )}
    </Page>
  );
}

/** A release note (release-notes): its intro, each highlight, the settings shortcut if any. */
function ReleaseNotePage({ note }: { note: ReleaseNote }) {
  const { t } = useTranslation();
  const key = (path: string) => `releaseNotes.${note.id}.${path}` as never;
  return (
    <Page
      title={t('inbox.releaseNote.heading')}
      header={
        <View style={styles.hero}>
          <Text variant="caption" style={styles.eyebrow}>
            {t('inbox.releaseNote.eyebrow')}
          </Text>
          <Text variant="title" role="heading">
            {t(key('title'))}
          </Text>
          <Text>{t(key('intro'))}</Text>
        </View>
      }
    >
      <ListSection>
        {note.features.map((feature) => (
          <ListRow
            key={feature.key}
            title={t(key(`features.${feature.key}.title`))}
            subtitle={t(key(`features.${feature.key}.body`))}
            icon={feature.icon as IconName}
            chevron={false}
          />
        ))}
      </ListSection>
      {note.action === 'notification-settings' ? (
        <ListSection footer={t('inbox.releaseNote.settingsHint')}>
          <ListRow
            title={t('inbox.releaseNote.settingsAction')}
            icon="notifications"
            onPress={() =>
              router.navigate({ pathname: '/profile', params: { open: 'notifications' } })
            }
          />
        </ListSection>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.xxs, paddingVertical: space.xs },
  eyebrow: { color: color.primary },
});
