import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity, isOnline } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { I18nT } from '@/core/web/i18n-t.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { TERMS_VERSION } from '@/features/terms/domain/terms';
import { useTermsStore } from '@/features/terms/presentation/stores/terms-store';
import { DeleteAccountDialog } from '@/features/user/presentation/web/delete-account-dialog.web';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import styles from './terms-page.module.css';

const c = classes(styles);

// What the terms mean for the user, one line each, in this order.
const points = [
  { key: 'plans', icon: 'share' },
  { key: 'risk', icon: 'hiking' },
  { key: 'liability', icon: 'warning' },
  { key: 'indemnity', icon: 'group' },
] as const;

/** The PWA's terms acceptance page (terms-acceptance), at `/accept-terms` on the web. */
export function TermsPage() {
  const { t, i18n } = useTranslation('web');
  const gate = useTermsStore((s) => s.gate);
  const offline = useTermsStore((s) => s.offline);
  const accepting = useTermsStore((s) => s.accepting);
  const failed = useTermsStore((s) => s.failed);
  const online = useStore(connectivity, (s) => s.online);

  const canAccept = gate === 'accept' || gate === 'changed';
  const noConnection = !online || offline;
  const whatChanged =
    (t('terms.whatChanged', { returnObjects: true }) as unknown as Record<string, string>)[
      TERMS_VERSION
    ] ?? '';
  const site = `https://tourenbuddy.ch${i18n.language.startsWith('de') ? '/de' : ''}`;

  // Back online: an earlier failure is stale, and with nothing confirmed, ask the server again.
  useEffect(() => {
    if (!online) return;
    useTermsStore.setState({ failed: false });
    if (useTermsStore.getState().offline) void useTermsStore.getState().check();
  }, [online]);

  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function signOut() {
    await useAuthStore.getState().signOut();
    router.push('/');
  }

  async function deleteAccount() {
    if (!isOnline()) {
      setDeleteError(t('user.profile.deleteAccount.offline'));
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const deleted = await useUserProfileStore.getState().deleteAccount();
    setDeleting(false);
    if (!deleted) {
      setDeleteError(t('user.profile.deleteAccount.failed'));
      return;
    }
    setShowDelete(false);
    useUserProfileStore.getState().clear();
    await signOut();
  }

  return (
    <div className={c('page')}>
      <main className={c('card')} aria-labelledby="terms-title">
        <h1 id="terms-title" className={c('title')}>
          {t('terms.title')}
        </h1>

        {gate === 'loading' ? (
          <p className={c('muted')} role="status">
            …
          </p>
        ) : (
          <>
            {canAccept && (
              <>
                <p className={c('text')}>
                  {gate === 'changed'
                    ? t('terms.changedLead', { changes: whatChanged })
                    : t('terms.lead')}
                </p>
                <ul className={c('points')}>
                  {points.map((point) => (
                    <li key={point.key} className={c('point')}>
                      <span className={c('badge')}>
                        <BaseIcon name={point.icon} />
                      </span>
                      <span>{t(`terms.points.${point.key}`)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {canAccept ? (
              <I18nT
                keypath="terms.read"
                tag="p"
                className={c('text')}
                slots={{
                  terms: (
                    <a href={`${site}/terms`} target="_blank" rel="noopener">
                      {t('terms.termsLink')}
                    </a>
                  ),
                  privacy: (
                    <a href={`${site}/privacy`} target="_blank" rel="noopener">
                      {t('terms.privacyLink')}
                    </a>
                  ),
                }}
              />
            ) : (
              <p className={c('text')}>
                {gate === 'update' ? t('terms.update') : t('terms.unavailable')}
              </p>
            )}

            {canAccept && noConnection && (
              <p className={c('muted')} role="status">
                {t('terms.offline')}
              </p>
            )}
            {canAccept && failed && !noConnection && (
              <p className={c('error')} role="alert">
                {t('terms.failed')}
              </p>
            )}

            {canAccept ? (
              <BaseButton
                disabled={accepting || noConnection || deleting}
                data-testid="terms-accept"
                onClick={() => void useTermsStore.getState().accept()}
              >
                {accepting ? t('terms.accepting') : t('terms.acceptBtn')}
              </BaseButton>
            ) : gate === 'update' ? (
              // The web app updates by loading again.
              <BaseButton onClick={() => window.location.reload()}>
                {t('terms.updateBtn')}
              </BaseButton>
            ) : (
              <BaseButton onClick={() => void useTermsStore.getState().check()}>
                {t('terms.retryBtn')}
              </BaseButton>
            )}

            <BaseButton
              variant="secondary"
              disabled={accepting || deleting}
              onClick={() => void signOut()}
            >
              {t('terms.signOutBtn')}
            </BaseButton>
            <BaseButton
              variant="text"
              disabled={accepting || deleting}
              onClick={() => setShowDelete(true)}
            >
              {t('terms.deleteBtn')}
            </BaseButton>
          </>
        )}
      </main>

      {showDelete && (
        <DeleteAccountDialog
          deleting={deleting}
          error={deleteError}
          onConfirm={() => void deleteAccount()}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
