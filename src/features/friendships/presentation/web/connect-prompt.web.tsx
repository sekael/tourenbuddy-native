import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';

import styles from './connect-prompt.module.css';

const c = classes(styles);
type State = 'idle' | 'sending' | 'sent' | 'accepted' | 'error';

/** "Connect on TourenBuddy?" under a contact whose number has an account. */
export function ConnectPrompt({
  matchedUserId,
  beforeSend,
  beforeDismiss,
  showDismiss = true,
  className,
  onSent,
  onDismissed,
}: {
  matchedUserId: string;
  beforeSend?: () => Promise<void>;
  beforeDismiss?: () => Promise<void>;
  showDismiss?: boolean;
  className?: string;
  onSent?: () => void;
  onDismissed?: () => void;
}) {
  const { t } = useTranslation('web');
  const online = useStore(connectivity, (s) => s.online);
  const blockedUserIds = useUserBlocksStore((s) => s.blockedUserIds);
  // A pending incoming request from the matched user switches the prompt to accept.
  const acceptRequestId = useFriendshipsStore(
    (s) => s.incoming.find((r) => r.fromUserId === matchedUserId)?.id ?? null,
  );
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBlockedByTarget, setIsBlockedByTarget] = useState(false);
  const isHidden = isBlockedByTarget || blockedUserIds.has(matchedUserId);

  useEffect(() => {
    let live = true;
    void useUserBlocksStore
      .getState()
      .isBlockedBy(matchedUserId)
      .then((blocked) => live && setIsBlockedByTarget(blocked));
    return () => {
      live = false;
    };
  }, [matchedUserId]);

  async function handleSend() {
    setState('sending');
    setErrorMsg(null);
    try {
      await beforeSend?.();
      await useFriendshipsStore.getState().sendRequest(matchedUserId);
      setState('sent');
      onSent?.();
    } catch {
      setState('error');
      setIsBlockedByTarget(
        useUserBlocksStore.getState().isBlockedByCache.get(matchedUserId)?.value ?? false,
      );
      setErrorMsg(t('friendships.sendFailedRetry'));
    }
  }

  async function handleAccept() {
    if (!acceptRequestId) return;
    setState('sending');
    setErrorMsg(null);
    try {
      await useFriendshipsStore.getState().accept(acceptRequestId);
      setState('accepted');
      onSent?.();
    } catch {
      setState('error');
      setErrorMsg(t('friendships.sendFailedRetry'));
    }
  }

  async function handleDismiss() {
    if (!beforeDismiss) {
      onDismissed?.();
      return;
    }
    setState('sending');
    setErrorMsg(null);
    try {
      await beforeDismiss();
      onDismissed?.();
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : t('friendships.justSaveContact'));
    }
  }

  if (isHidden) return null;
  const sending = state === 'sending';
  return (
    <div className={c('connect-prompt', className)}>
      {state === 'sent' || state === 'accepted' ? (
        <p className={c('sent-msg')}>
          <BaseIcon name="check_circle" className={c('sent-icon')} />
          {state === 'sent' ? t('friendships.requestSent') : t('friendships.nowFriends')}
        </p>
      ) : (
        <>
          <div className={c('prompt-body')}>
            <p className={c('prompt-title')}>{t('friendships.prompt.title')}</p>
            <p className={c('security-note')}>{t('friendships.prompt.securityNote')}</p>
            {state === 'error' ? (
              <p className={c('error-text')}>{errorMsg}</p>
            ) : !online ? (
              <p className={c('offline-text')}>{t('offlineSync.friendshipsOnlineOnly')}</p>
            ) : null}
          </div>
          <div className={c('prompt-actions')}>
            {showDismiss && (
              <BaseButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={sending}
                onClick={() => void handleDismiss()}
              >
                {sending ? '…' : t('friendships.justSaveContact')}
              </BaseButton>
            )}
            <BaseButton
              type="button"
              variant="primary"
              size="sm"
              disabled={sending || !online}
              onClick={() => void (acceptRequestId ? handleAccept() : handleSend())}
            >
              {sending
                ? '…'
                : acceptRequestId
                  ? t('friendships.accept')
                  : t('friendships.sendRequest')}
            </BaseButton>
          </div>
        </>
      )}
    </div>
  );
}
