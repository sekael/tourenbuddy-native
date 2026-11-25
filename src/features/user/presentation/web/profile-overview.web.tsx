import { useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { setAppLanguage } from '@/core/i18n';
import { SUPPORTED_LOCALES } from '@/core/i18n/supported';
import { formatPhoneForDisplay } from '@/core/utils/phone-normalize';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';
import { useNotificationCapability } from '@/features/notifications/presentation/web/use-notification-capability.web';

import { AppUpdateNotice } from './app-update-notice.web';
import { AppVersionLine } from './app-version-line.web';
import styles from './profile-overview.module.css';
import { useFullProfile } from './use-full-profile.web';

const c = classes(styles);

export type ProfileSection = 'edit' | 'notifications' | 'calendar';

/** The profile at a glance: who you are, each setting's state, one tap to the section that changes it. */
export function ProfileOverview({
  onOpen,
  onShowTour,
  onSignOut,
  onDeleteAccount,
}: {
  onOpen: (section: ProfileSection) => void;
  onShowTour: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}) {
  const { t, i18n } = useTranslation('web');
  const tk = t as unknown as (key: string, params?: Record<string, unknown>) => string;
  const isDesktop = useIsDesktop();
  const full = useFullProfile();
  const prefs = useNotificationsStore((s) => s.prefs);
  const pushEnabled = useNotificationsStore((s) => s.pushEnabled);
  const permission = useNotificationsStore((s) => s.permission);
  const feeds = useCalendarFeedStore((s) => s.feeds);
  const { pushSupported } = useNotificationCapability();

  const email = full?.email ?? '';
  const displayName =
    [full?.firstName, full?.lastName].filter(Boolean).join(' ') || email || 'User';
  const phone = full?.phoneNumber;
  const displayPhone = phone ? formatPhoneForDisplay(phone) || phone : null;
  const localeIndex = SUPPORTED_LOCALES.findIndex((l) => l.code === i18n.language);

  const notificationsValue = (() => {
    if (!prefs) return '';
    const push = pushEnabled && pushSupported && permission !== 'denied';
    const mail = prefs.notifEmailEnabled;
    const key = push && mail ? 'pushAndEmail' : push ? 'push' : mail ? 'email' : 'off';
    return tk(`user.profile.notificationsSummary.${key}`);
  })();
  const calendarProblem = feeds.some((f) => f.lastError);
  const calendarValue = calendarProblem
    ? t('user.profile.calendarProblem')
    : t('user.profile.calendarSummary', { count: feeds.length });

  useEffect(() => {
    if (!useNotificationsStore.getState().prefs) void useNotificationsStore.getState().loadPrefs();
    void useCalendarFeedStore.getState().loadFeeds();
  }, []);

  return (
    <div className={c('overview')}>
      <AppUpdateNotice />

      <button
        type="button"
        className={c('identity')}
        data-testid="edit-profile-btn"
        data-tour="phone-verification"
        title={isDesktop ? t('user.profile.editBtn') : undefined}
        onClick={() => onOpen('edit')}
      >
        <span className={c('avatar')} aria-hidden="true">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className={c('identity-text')}>
          <span className={c('name')}>{displayName}</span>
          <span className={c('secondary-text')}>{email}</span>
          <span className={c('phone secondary-text')} data-testid="phone-status">
            {displayPhone ? (
              <>
                <span>{displayPhone}</span>
                {full?.phoneVerified ? (
                  <>
                    <BaseIcon name="verified" className={c('verified-icon')} />
                    <span className="visually-hidden">{t('user.profile.verifiedTooltip')}</span>
                  </>
                ) : (
                  <span className={c('badge badge--alert')}>{t('user.profile.notVerified')}</span>
                )}
              </>
            ) : (
              <span className={c('badge')}>{t('user.profile.addPhoneBtn')}</span>
            )}
          </span>
        </span>
        <BaseIcon name="chevron_right" className={c('chevron')} />
      </button>

      <ul className={c('group')}>
        <li className={c('row')}>
          <BaseIcon name="language" className={c('row-icon')} />
          <span id="profile-language-label" className={c('row-label')}>
            {t('user.profile.languageLabel')}
          </span>
          <div
            className={c('language')}
            role="group"
            aria-labelledby="profile-language-label"
            data-tab-indicator
            style={
              {
                '--tab-index': localeIndex,
                '--tab-count': SUPPORTED_LOCALES.length,
              } as CSSProperties
            }
          >
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc.code}
                type="button"
                aria-pressed={i18n.language === loc.code}
                onClick={() => setAppLanguage(loc.code)}
              >
                {loc.label}
              </button>
            ))}
          </div>
        </li>
        <li>
          <button
            type="button"
            className={c('row row--nav')}
            data-tour="notifications"
            onClick={() => onOpen('notifications')}
          >
            <BaseIcon name="notifications" className={c('row-icon')} />
            <span className={c('row-text')}>
              <span className={c('row-label')}>{t('notifications.sectionTitle')}</span>
              <span className={c('row-value')}>{notificationsValue}</span>
            </span>
            <BaseIcon name="chevron_right" className={c('chevron')} />
          </button>
        </li>
        <li>
          <button
            type="button"
            className={c('row row--nav')}
            data-tour="calendar-sync"
            onClick={() => onOpen('calendar')}
          >
            <BaseIcon name="calendar_today" className={c('row-icon')} />
            <span className={c('row-text')}>
              <span className={c('row-label')}>{t('calendar.sync.title')}</span>
              <span className={c('row-value', { 'row-value--alert': calendarProblem })}>
                {calendarValue}
              </span>
            </span>
            <BaseIcon name="chevron_right" className={c('chevron')} />
          </button>
        </li>
        <li>
          <button type="button" className={c('row row--nav')} onClick={onShowTour}>
            <BaseIcon name="tour" className={c('row-icon')} />
            <span className={c('row-text')}>
              <span className={c('row-label')}>{t('onboarding.tour.controls.reopen')}</span>
            </span>
            <BaseIcon name="chevron_right" className={c('chevron')} />
          </button>
        </li>
      </ul>

      <BaseButton variant="secondary" className={c('sign-out')} onClick={onSignOut}>
        <BaseIcon name="logout" />
        {t('user.profile.signOutBtn')}
      </BaseButton>

      <BaseButton
        variant="text"
        className={c('delete-account')}
        data-testid="delete-account-btn"
        onClick={onDeleteAccount}
      >
        {t('user.profile.deleteAccount.entryBtn')}
      </BaseButton>

      <AppVersionLine />
    </div>
  );
}
