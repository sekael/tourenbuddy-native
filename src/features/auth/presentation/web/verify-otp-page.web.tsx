import { AuthApiError } from '@supabase/supabase-js';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';

import { AuthHeroLayout } from './auth-hero-layout.web';
import styles from './verify-otp-page.module.css';

const c = classes(styles);

// Supabase refuses a second code inside its minimum interval (hosted: 60 s) with a 429. The code
// was sent just before this page opened, so the button cools down at once.
const RESEND_COOLDOWN = 60;

/**
 * The PWA's code page. Leaving it after a verified code is the root layout's job (signed in on a
 * signed-out page → the map). The field keeps digits only and submits itself at six, never twice
 * with the same rejected code (autofill).
 */
export function VerifyOtpPage() {
  const { t } = useTranslation('web');
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const sendEmailOtp = useAuthStore((s) => s.sendEmailOtp);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  /** Last code handed to `verifyOtp`, so autofill never resubmits a rejected one. */
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleVerify(value = code) {
    if (isVerifying || value.length < 6) return;
    attempted.current = value;
    setError(null);
    setIsVerifying(true);
    try {
      await verifyOtp(email, value);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.verifyOtp.verifyError'));
      setCode('');
    } finally {
      setIsVerifying(false);
    }
  }

  // Normalized on every change, not on paste: iOS autofill, Android's clipboard chip and drag and
  // drop fill the field without a paste event. `123 456` is the same code with formatting.
  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !isVerifying && digits !== attempted.current)
      void handleVerify(digits);
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
    setResendSuccess(false);
    setIsResending(true);
    try {
      await sendEmailOtp(email);
      setResendSuccess(true);
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      // "…you can only request this after 42 seconds.": wait out the server's own clock.
      const wait =
        err instanceof AuthApiError && err.status === 429
          ? Number(err.message.match(/(\d+) seconds?/)?.[1] ?? RESEND_COOLDOWN)
          : 0;
      if (wait) setCooldown(wait);
      else setError(t('auth.verifyOtp.resendError'));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthHeroLayout>
      <BaseButton
        variant="text"
        size="sm"
        className={c('back-btn')}
        onClick={() => router.push('/')}
      >
        <BaseIcon name="arrow_back" size="sm" />
        {t('auth.verifyOtp.backBtn')}
      </BaseButton>
      {/* h3, not h1: the hero layout owns the page's only first-level heading. */}
      <h3 className={c('title')}>{t('auth.verifyOtp.title')}</h3>
      <p className={c('subtitle')}>
        {t('auth.verifyOtp.subtitlePrefix')} <strong>{email}</strong>
      </p>

      <form
        className={c('form')}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void handleVerify();
        }}
      >
        <div className={c('field')}>
          <label htmlFor="otp-code" className={c('visually-hidden')}>
            {t('auth.verifyOtp.inputLabel')}
          </label>
          <input
            id="otp-code"
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className={c('input')}
            placeholder={t('auth.verifyOtp.inputPlaceholder')}
            required
          />
        </div>

        {error && <p className={c('error-text')}>{error}</p>}
        {resendSuccess && <p className={c('success-text')}>{t('auth.verifyOtp.resendSuccess')}</p>}

        <BaseButton type="submit" variant="primary" disabled={isVerifying || code.length < 6}>
          {isVerifying ? t('auth.shared.sendingBtn') : t('auth.verifyOtp.verifyBtn')}
        </BaseButton>
      </form>

      <BaseButton
        variant="secondary"
        disabled={isResending || cooldown > 0}
        onClick={() => void handleResend()}
      >
        {cooldown > 0
          ? t('auth.verifyOtp.resendCountdown', { seconds: cooldown })
          : isResending
            ? t('auth.shared.sendingBtn')
            : t('auth.verifyOtp.resendBtn')}
      </BaseButton>
    </AuthHeroLayout>
  );
}
