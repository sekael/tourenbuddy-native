import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { sessionTrust } from '@/core/auth/session-trust';
import { connectivity } from '@/core/offline/online';
import { offlineSignals } from '@/core/offline/signals';

import { BaseIcon } from './base-icon.web';
import { classes } from './classes';
import { ErrorSnackbar } from './error-snackbar.web';
import styles from './offline-indicator.module.css';
import { useTimedFlag } from './use-snackbar.web';

const c = classes(styles);

/**
 * The PWA's global offline surface: a slim bar at the top that takes its own band (safe-area.css)
 * while offline or while changes wait to sync, with their count; a blocked write and a failed
 * offline write each raise a transient notice.
 */
export function OfflineIndicator() {
  const { t } = useTranslation('web');
  const online = useStore(connectivity, (s) => s.online);
  const unverified = useStore(sessionTrust, (s) => s.unverified);
  const count = useStore(offlineSignals, (s) => s.pendingCount);
  const blockedAt = useStore(offlineSignals, (s) => s.offlineBlockedAt);
  const writeError = useStore(offlineSignals, (s) => s.offlineWriteError);

  // A session restored without a successful refresh serves cached data: it reads as offline.
  const degraded = !online || unverified;
  const barText =
    degraded && count > 0
      ? t('offline.bar.waiting', { count })
      : degraded
        ? unverified
          ? t('offline.bar.unverified')
          : t('offline.bar.offline')
        : count > 0
          ? t('offlineSync.pendingCount', { count })
          : '';

  // The last text and icon stay while the band closes, so the bar doesn't empty before it shrinks.
  const [shown, setShown] = useState({ text: '', icon: 'cloud_off' });
  if (barText && (barText !== shown.text || shown.icon !== (degraded ? 'cloud_off' : 'sync_alt')))
    setShown({ text: barText, icon: degraded ? 'cloud_off' : 'sync_alt' });

  const [notice, showNotice, hideNotice] = useTimedFlag(4000);
  const [writeErrorVisible, showWriteError, hideWriteError] = useTimedFlag(5000);
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current && blockedAt) showNotice();
  }, [blockedAt]);
  useEffect(() => {
    if (!mounted.current) return;
    if (writeError) showWriteError();
    else hideWriteError();
  }, [writeError]);
  useEffect(() => {
    mounted.current = true;
  }, []);

  return (
    <>
      {/* Always in the DOM, so the live region announces each change of its text. */}
      <div className={c('offline-bar', { 'offline-bar--on': barText })} role="status">
        <BaseIcon name={shown.icon} size="sm" />
        <span className={c('offline-bar-text')}>{shown.text}</span>
      </div>
      <ErrorSnackbar
        visible={notice}
        message={t('offline.actionUnavailable')}
        onDismiss={hideNotice}
      />
      <ErrorSnackbar
        visible={writeErrorVisible}
        message={writeError ? t(writeError as never) : ''}
        onDismiss={hideWriteError}
      />
    </>
  );
}
