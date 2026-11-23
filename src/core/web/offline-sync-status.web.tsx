import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { refreshQueueStatus, replayQueue } from '@/core/offline/replay';
import { offlineSignals } from '@/core/offline/signals';
import {
  discardDeadLetter,
  retryDeadLetter,
  type WriteQueueEntry,
} from '@/core/offline/write-queue';

import { AdaptiveOverlay } from './adaptive-overlay.web';
import { BaseIcon } from './base-icon.web';
import { classes } from './classes';
import styles from './offline-sync-status.module.css';
import { Transition } from './transition.web';
import { useSnackbarSlot, useTimedFlag } from './use-snackbar.web';

const c = classes(styles);

async function retryDeadLettered(entityId: string) {
  await retryDeadLetter(entityId);
  await refreshQueueStatus();
  void replayQueue().finally(refreshQueueStatus);
}

async function discardDeadLettered(entityId: string) {
  await discardDeadLetter(entityId);
  await refreshQueueStatus();
}

// core/ never imports feature types: the entity's name read structurally from the queued payload.
function readName(o: unknown): string | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  if (typeof r.name === 'string' && r.name.trim()) return r.name.trim();
  if (typeof r.displayName === 'string' && r.displayName.trim()) return r.displayName.trim();
  const first = typeof r.firstName === 'string' ? r.firstName.trim() : '';
  const last = typeof r.lastName === 'string' ? r.lastName.trim() : '';
  return `${first} ${last}`.trim() || null;
}

function entityName(entry: WriteQueueEntry): string | null {
  const p = entry.payload as Record<string, unknown> | null;
  for (const candidate of [p?.draft, p?.contact, p, entry.baseSnapshot]) {
    const name = readName(candidate);
    if (name) return name;
  }
  return null;
}

/**
 * The PWA's sync status: the pending count kept current, a brief "N waiting" toast on the first
 * queued change, "N synced" once the queue drained, and a dead-letter banner with its review.
 */
export function OfflineSyncStatus() {
  const { t, i18n } = useTranslation('web');
  const pendingCount = useStore(offlineSignals, (s) => s.pendingCount);
  const deadLetters = useStore(offlineSignals, (s) => s.deadLetters);
  const savedOfflineAt = useStore(offlineSignals, (s) => s.savedOfflineAt);
  const drainedAt = useStore(offlineSignals, (s) => s.drainedAt);

  useEffect(() => {
    void refreshQueueStatus();
  }, [savedOfflineAt, drainedAt]);

  const [pendingText, showPending, hidePending] = useTimedFlag(4000);
  const [synced, setSynced] = useState(0);
  const syncedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const claimSynced = useSnackbarSlot(() => setSynced(0));
  const prev = useRef({ n: pendingCount, dead: deadLetters.length });
  useEffect(() => {
    const { n: before, dead: deadBefore } = prev.current;
    prev.current = { n: pendingCount, dead: deadLetters.length };
    if (before === 0 && pendingCount > 0) showPending();
    else if (pendingCount === 0) hidePending();
    // Drained online with nothing newly failed: say the changes went through.
    if (
      pendingCount > 0 ||
      before === 0 ||
      deadLetters.length > deadBefore ||
      !connectivity.getState().online
    )
      return;
    claimSynced();
    setSynced(before);
    clearTimeout(syncedTimer.current);
    syncedTimer.current = setTimeout(() => setSynced(0), 3000);
  }, [pendingCount, deadLetters.length]);

  const [reviewOpen, setReviewOpen] = useState(false);
  // The banner collapses to an icon; hover or tap expands it for 5 s.
  const [expanded, setExpanded] = useState(false);
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expand = () => {
    setExpanded(true);
    if (expandTimer.current) clearTimeout(expandTimer.current);
    expandTimer.current = setTimeout(() => setExpanded(false), 5000);
  };
  useEffect(
    () => () => {
      if (expandTimer.current) clearTimeout(expandTimer.current);
      clearTimeout(syncedTimer.current);
    },
    [],
  );

  const entryLabel = (entry: WriteQueueEntry) => {
    const kindKey = `offlineSync.deadLetter.kind.${entry.kind}`;
    const kindLabel = i18n.exists(kindKey, { ns: 'web' }) ? t(kindKey as never) : entry.kind;
    const name = entityName(entry);
    return t(`offlineSync.deadLetter.op.${entry.op}` as never, {
      entity: name ? `${kindLabel} ${name}` : kindLabel,
    });
  };
  const reasonText = (entry: WriteQueueEntry) =>
    entry.deadReason === 'conflict'
      ? t('offlineSync.conflictLost')
      : entry.deadReason === 'transient'
        ? t('offlineSync.deadLetter.transientReason')
        : entry.deadReason === 'permanent'
          ? t('offlineSync.deadLetter.permanentReason')
          : null;

  return (
    <>
      <Transition name="sync-toast" cls={c}>
        {pendingText && (
          <div className={c('sync-toast')} role="status">
            <BaseIcon name="sync_alt" size="sm" />
            <span>{t('offlineSync.pendingCount', { count: pendingCount })}</span>
          </div>
        )}
      </Transition>

      <Transition name="sync-toast" cls={c}>
        {synced > 0 && (
          <div className={c('sync-toast')} role="status" data-testid="synced-toast">
            <BaseIcon name="cloud_done" size="sm" />
            <span>{t('offlineSync.synced', { count: synced })}</span>
          </div>
        )}
      </Transition>

      <Transition name="sync-toast" cls={c}>
        {deadLetters.length > 0 && !reviewOpen && (
          <div
            className={c('sync-deadletter', { 'sync-deadletter--expanded': expanded })}
            role="status"
            onClick={expand}
            onMouseEnter={expand}
          >
            <BaseIcon name="warning" size="sm" />
            <span className={c('dl-body')}>
              <span className={c('dl-text')}>
                {t('offlineSync.deadLetter.banner', { count: deadLetters.length })}
              </span>
              <button
                type="button"
                className={c('dl-review')}
                onClick={(e) => {
                  e.stopPropagation();
                  setReviewOpen(true);
                }}
              >
                {t('offlineSync.deadLetter.review')}
              </button>
            </span>
          </div>
        )}
      </Transition>

      {reviewOpen &&
        createPortal(
          <div
            className={c('review-host')}
            onClick={(e) => e.target === e.currentTarget && setReviewOpen(false)}
          >
            <AdaptiveOverlay
              title={t('offlineSync.deadLetter.title')}
              onClose={() => setReviewOpen(false)}
            >
              {deadLetters.length === 0 ? (
                <p className={c('deadletter-empty')}>{t('offlineSync.deadLetter.empty')}</p>
              ) : (
                <ul className={c('deadletter-list')}>
                  {deadLetters.map((entry) => (
                    <li key={entry.entityId} className={c('deadletter-item')}>
                      <div className={c('meta')}>
                        <span className={c('what')}>{entryLabel(entry)}</span>
                        {reasonText(entry) && (
                          <span className={c('reason')}>{reasonText(entry)}</span>
                        )}
                      </div>
                      <div className={c('actions')}>
                        {/* Retry only for a transient outage: anything else re-fails identically. */}
                        {entry.deadReason === 'transient' && (
                          <button
                            type="button"
                            className={c('retry')}
                            onClick={() => void retryDeadLettered(entry.entityId)}
                          >
                            <BaseIcon name="sync_alt" size="sm" />
                            {t('offlineSync.deadLetter.retry')}
                          </button>
                        )}
                        <button
                          type="button"
                          className={c('discard')}
                          onClick={() => void discardDeadLettered(entry.entityId)}
                        >
                          <BaseIcon name="delete" size="sm" />
                          {t('offlineSync.deadLetter.discard')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </AdaptiveOverlay>
          </div>,
          document.body,
        )}
    </>
  );
}
