import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { refreshQueueStatus, replayQueue } from '@/core/offline/replay';
import { offlineSignals } from '@/core/offline/signals';
import {
  discardDeadLetter,
  retryDeadLetter,
  type WriteQueueEntry,
} from '@/core/offline/write-queue';
import { color } from '@/core/theme/tokens';

const KINDS = ['tour', 'contact', 'friendship', 'availability', 'inbox', 'notif-prefs', 'profile'];

/** A name to tell the change by: a tour's, a contact's. */
function nameOf(payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.name === 'string') return p.name;
  return [p.firstName, p.lastName].filter((part) => typeof part === 'string').join(' ');
}

/**
 * Changes that could not sync (offline-write-sync "Dead letters are reviewable"): each with what it
 * was and why it failed. One the server could not be reached for can be retried; one it refused,
 * or that lost to an edit on another device, can only be discarded.
 */
export function SyncIssuesSheet() {
  const { t } = useTranslation();
  const dead = useStore(offlineSignals, (s) => s.deadLetters);

  useEffect(() => {
    void refreshQueueStatus();
  }, []);

  const retry = async (entry: WriteQueueEntry) => {
    await retryDeadLetter(entry.entityId);
    await refreshQueueStatus();
    void replayQueue();
  };
  const discard = async (entry: WriteQueueEntry) => {
    await discardDeadLetter(entry.entityId);
    await refreshQueueStatus();
  };

  const row = (entry: WriteQueueEntry) => {
    const kind = KINDS.includes(entry.kind) ? entry.kind : 'tour';
    const title = t(`offlineSync.deadLetter.op.${entry.op}`, {
      entity: t(`offlineSync.deadLetter.kind.${kind}` as never),
    });
    const reason =
      entry.deadReason === 'conflict'
        ? t('offlineSync.conflictLost')
        : entry.deadReason === 'transient'
          ? t('offlineSync.deadLetter.transientReason')
          : t('offlineSync.deadLetter.permanentReason');
    const name = nameOf(entry.payload);
    const retryable = entry.deadReason === 'transient';
    return (
      <ListRow
        key={entry.entityId}
        title={name ? `${title}: ${name}` : title}
        subtitle={reason}
        icon="sync_problem"
        iconColor={color.error}
        chevron={false}
        menu={[
          ...(retryable
            ? [
                {
                  label: t('offlineSync.deadLetter.retry'),
                  icon: 'replay' as const,
                  onPress: () => void retry(entry),
                },
              ]
            : []),
          {
            label: t('offlineSync.deadLetter.discard'),
            icon: 'delete' as const,
            destructive: true,
            onPress: () => void discard(entry),
          },
        ]}
        swipeActions={[
          {
            label: t('offlineSync.deadLetter.discard'),
            icon: 'delete',
            destructive: true,
            onPress: () => void discard(entry),
          },
        ]}
      />
    );
  };

  return (
    <Screen>
      <Page title={t('offlineSync.deadLetter.title')} onClose={() => router.back()}>
        {dead.length ? (
          <ListSection>{dead.map(row)}</ListSection>
        ) : (
          <EmptyState icon="cloud_done" title={t('offlineSync.deadLetter.empty')} />
        )}
      </Page>
    </Screen>
  );
}
