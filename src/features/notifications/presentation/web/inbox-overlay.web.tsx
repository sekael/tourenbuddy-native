import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdaptiveOverlay } from '@/core/web/adaptive-overlay.web';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { findReleaseNote, type ReleaseNote } from '@/features/notifications/data/release-notes';
import type { InboxNotification } from '@/features/notifications/domain/entities/inbox-notification';
import { useInboxStaleness } from '@/features/notifications/presentation/inbox-sheet';
import { useInboxStore } from '@/features/notifications/presentation/stores/inbox-store';

import { InboxItem } from './inbox-item.web';
import styles from './inbox-overlay.module.css';
import { ReleaseNoteView } from './release-note-view.web';

const c = classes(styles);

/**
 * The inbox: static records, a tap opens the subject where acting happens (D7); a known release
 * note is read in place. Clearing is two-step, inline.
 */
export function InboxOverlay({
  onClose,
  onOpen,
  onOpenSettings,
}: {
  onClose: () => void;
  onOpen: (entry: InboxNotification) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation('web');
  const entries = useInboxStore((s) => s.entries);
  const hasMore = useInboxStore((s) => s.hasMore);
  const isLoading = useInboxStore((s) => s.isLoading);
  const loadFailed = useInboxStore((s) => s.loadFailed);
  const staleReason = useInboxStaleness();
  const store = useInboxStore.getState();
  const hasUnread = entries.some((e) => !e.readAt);
  const [confirmingClear, setConfirmingClear] = useState(false);
  /** A release note being read, shown in place of the list (back returns to it). */
  const [note, setNote] = useState<ReleaseNote | null>(null);

  function open(entry: InboxNotification) {
    void store.markRead(entry.id);
    const known = entry.type === 'release_notes' ? findReleaseNote(entry.ref.note_id) : null;
    if (known) setNote(known);
    else onOpen(entry);
  }

  useEffect(() => {
    if (useInboxStore.getState().entries.length === 0) void useInboxStore.getState().load();
  }, []);

  return (
    <AdaptiveOverlay
      title={note ? t('inbox.releaseNote.heading') : t('inbox.title')}
      showBack={!!note}
      fitContent
      onClose={onClose}
      onBack={() => setNote(null)}
      headerActions={
        hasUnread && !note ? (
          <BaseButton
            variant="primary-outline"
            size="sm"
            data-testid="mark-all-read"
            onClick={() => void store.markAllRead()}
          >
            {t('inbox.markAllRead')}
          </BaseButton>
        ) : undefined
      }
    >
      {note ? (
        <ReleaseNoteView note={note} onOpenSettings={onOpenSettings} />
      ) : (
        <div className={c('content')}>
          {loadFailed && entries.length === 0 ? (
            <p className={c('empty')}>{t('inbox.loadError')}</p>
          ) : !isLoading && entries.length === 0 ? (
            <p className={c('empty')} data-testid="inbox-empty">
              <BaseIcon name="notifications" size="xl" className={c('empty-icon')} />
              {t('inbox.empty')}
            </p>
          ) : (
            <ul className={c('list')}>
              {entries.map((entry) => (
                <InboxItem
                  key={entry.id}
                  entry={entry}
                  stale={staleReason(entry)}
                  onOpen={() => open(entry)}
                  onDelete={() => void store.remove(entry.id)}
                />
              ))}
            </ul>
          )}
          {hasMore && (
            <BaseButton
              variant="secondary"
              className={c('more')}
              disabled={isLoading}
              data-testid="load-more"
              onClick={() => void store.loadMore()}
            >
              {t('inbox.loadMore')}
            </BaseButton>
          )}
          {entries.length > 0 && (
            <div className={c('clear', { 'clear--confirm': confirmingClear })}>
              {!confirmingClear ? (
                <BaseButton
                  variant="text"
                  size="sm"
                  data-testid="clear-inbox"
                  onClick={() => setConfirmingClear(true)}
                >
                  {t('inbox.clearAll')}
                </BaseButton>
              ) : (
                <>
                  <span className={c('clear-question')}>{t('inbox.clearConfirm')}</span>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmingClear(false)}
                  >
                    {t('inbox.cancel')}
                  </BaseButton>
                  <BaseButton
                    variant="danger"
                    size="sm"
                    data-testid="clear-inbox-confirm"
                    onClick={() => {
                      setConfirmingClear(false);
                      void store.clearAll();
                    }}
                  >
                    {t('inbox.clearAllConfirm')}
                  </BaseButton>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </AdaptiveOverlay>
  );
}
