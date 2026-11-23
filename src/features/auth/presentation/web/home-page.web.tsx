import { router } from 'expo-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { isOnline } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { classes } from '@/core/web/classes';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';

import { AuthHeroLayout } from './auth-hero-layout.web';
import styles from './home-page.module.css';

const c = classes(styles);
const emailRegex = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

/** The PWA's sign-in page: the address, then the code by email. */
export function HomePage() {
  const { t } = useTranslation('web');
  const sendEmailOtp = useAuthStore((s) => s.sendEmailOtp);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailRegex.test(email)) {
      setError(t('auth.emailEntry.invalidEmail'));
      return;
    }
    // A first sign-in needs the network (the code is mailed): say so instead of "Failed to fetch".
    if (!isOnline()) {
      setError(t('offline.actionUnavailable'));
      return;
    }
    setIsLoading(true);
    try {
      await sendEmailOtp(email);
      router.push({ pathname: '/auth/verify-otp', params: { email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.emailEntry.sendError'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthHeroLayout>
      {/* h3, not h1: the hero layout owns the page's only first-level heading. */}
      <h3 className={c('title')}>{t('auth.emailEntry.title')}</h3>
      <p className={c('subtitle')}>{t('auth.emailEntry.subtitle')}</p>

      <form className={c('form')} onSubmit={handleSubmit}>
        <div className={c('field')}>
          {/* Hidden, not absent: the placeholder is not an accessible name. */}
          <label htmlFor="email" className={c('visually-hidden')}>
            {t('auth.emailEntry.emailLabel')}
          </label>
          <input
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            name="email"
            type="email"
            className={c('input')}
            placeholder={t('auth.emailEntry.emailPlaceholder')}
            autoComplete="email"
            required
          />
        </div>

        {error && <p className={c('error-text')}>{error}</p>}

        <BaseButton type="submit" variant="primary" disabled={isLoading}>
          {isLoading ? t('auth.shared.sendingBtn') : t('auth.emailEntry.sendCodeBtn')}
        </BaseButton>
      </form>
    </AuthHeroLayout>
  );
}
