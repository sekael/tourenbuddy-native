import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { formatPhoneForDisplay } from '@/core/utils/phone-normalize';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { ModalOverlay } from '@/core/web/modal-overlay.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import styles from './phone-verification-dialog.module.css';

const c = classes(styles);
const RESEND_COOLDOWN = 30;

/** The PWA's SMS code step for a phone number; confirms, then closes itself. */
export function PhoneVerificationDialog({
  phone,
  onVerified,
  onClose,
}: {
  phone: string;
  onVerified: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('web');
  const isDesktop = useIsDesktop();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function handleVerify(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (otp.length < 6) {
      setError(t('user.phoneVerification.incompleteCode'));
      return;
    }
    setIsVerifying(true);
    try {
      await useUserProfileStore.getState().verifyPhone(phone, otp.trim());
      setIsVerified(true);
      setTimeout(onVerified, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('user.phoneVerification.invalidCode'));
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setIsResending(true);
    setResendSuccess(false);
    setError(null);
    try {
      await useUserProfileStore.getState().sendPhoneVerification(phone);
      setResendSuccess(true);
      setResendCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('user.phoneVerification.resendError'));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <ModalOverlay
      className={c('sheet-host--modal')}
      title={isVerified ? '' : t('user.phoneVerification.title')}
      onClose={onClose}
    >
      <div className={c('dialog-content')}>
        {isVerified ? (
          <div className={c('verified-state')}>
            <BaseIcon name="check_circle" className={c('verified-icon')} size="xl" />
            <p className={c('verified-text')}>{t('user.phoneVerification.verifiedMsg')}</p>
          </div>
        ) : (
          <>
            <p className={c('subtitle')}>
              {t('user.phoneVerification.subtitlePrefix')}{' '}
              <strong>{formatPhoneForDisplay(phone)}</strong>
            </p>
            <form className={c('form')} onSubmit={(e) => void handleVerify(e)}>
              <div className={c('field')}>
                <label
                  htmlFor={isDesktop ? 'phone-otp-desktop' : 'phone-otp'}
                  className={c('label')}
                >
                  {t('user.phoneVerification.codeLabel')}
                </label>
                <input
                  id={isDesktop ? 'phone-otp-desktop' : 'phone-otp'}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  type="text"
                  className={c('input otp-input')}
                  placeholder={t('user.phoneVerification.codePlaceholder')}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
              {error && <p className={c('error-text')}>{error}</p>}
              {resendSuccess && (
                <p className={c('success-text')}>{t('user.phoneVerification.resendSuccess')}</p>
              )}
              <BaseButton type="submit" variant="primary" disabled={isVerifying}>
                {isVerifying
                  ? t('user.phoneVerification.verifyingBtn')
                  : t('user.phoneVerification.verifyBtn')}
              </BaseButton>
            </form>
            <BaseButton
              variant="secondary"
              size="sm"
              disabled={isResending || resendCooldown > 0}
              onClick={() => void handleResend()}
            >
              {resendCooldown > 0
                ? `${t('user.phoneVerification.resendCountdown')} ${resendCooldown}s`
                : isResending
                  ? t('user.phoneVerification.sendingBtn')
                  : t('user.phoneVerification.resendBtn')}
            </BaseButton>
          </>
        )}
      </div>
    </ModalOverlay>
  );
}
