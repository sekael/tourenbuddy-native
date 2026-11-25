import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { classes } from '@/core/web/classes';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import {
  MUTABLE_NOTIFICATION_TYPES,
  type NotificationType,
} from '@/features/notifications/domain/entities/notification-preferences';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';

import styles from './notification-preferences-section.module.css';
import { useNotificationCapability } from './use-notification-capability.web';

const c = classes(styles);

/** Push (this device) and email (account-wide), then the muted types. */
export function NotificationPreferencesSection() {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const prefs = useNotificationsStore((s) => s.prefs);
  const permission = useNotificationsStore((s) => s.permission);
  const pushEnabled = useNotificationsStore((s) => s.pushEnabled);
  const online = useStore(connectivity, (s) => s.online);
  const { pushSupported, requiresPwaInstall } = useNotificationCapability();
  const isDesktop = useIsDesktop();
  const store = useNotificationsStore.getState();

  useEffect(() => void useNotificationsStore.getState().loadPrefs(), []);

  const allOff = prefs !== null && !pushEnabled && !prefs.notifEmailEnabled;
  const unavailableHint = requiresPwaInstall
    ? t('notifications.installHint')
    : permission === 'denied'
      ? t('notifications.deniedHint')
      : null;
  const isTypeMuted = (type: NotificationType) => prefs?.notifMutedTypes.includes(type) ?? false;

  return (
    <section className={c('notifications-section')}>
      {!prefs ? (
        <div className={c('loading-placeholder')} />
      ) : (
        <>
          <ul className={c('rows')}>
            <li className={c('row', { 'row--with-description': !!unavailableHint && !isDesktop })}>
              <div className={c('row-text')}>
                <span className={c('row-label')}>{t('notifications.pushLabel')}</span>
                {/* Mobile has no tooltips: the explanation is shown inline instead. */}
                {unavailableHint && !isDesktop && (
                  <span className={c('row-description')}>{unavailableHint}</span>
                )}
              </div>
              {unavailableHint ? (
                <span className={c('unavailable')}>
                  <span className={c('unavailable__label')}>
                    {t('notifications.pushUnavailable')}
                  </span>
                  {isDesktop && (
                    <BaseTooltip text={unavailableHint}>
                      <BaseIconButton
                        name="info"
                        label={unavailableHint}
                        size="sm"
                        className={c('unavailable__info', {
                          'unavailable__info--warning': !requiresPwaInstall,
                        })}
                      />
                    </BaseTooltip>
                  )}
                </span>
              ) : pushSupported ? (
                <label className={c('switch')}>
                  <input
                    type="checkbox"
                    checked={pushEnabled}
                    disabled={!online}
                    aria-label={t('notifications.pushLabel')}
                    data-testid="push-toggle"
                    onChange={(e) => void store.setPushEnabled(e.target.checked)}
                  />
                  <span className={c('track')} />
                </label>
              ) : null}
            </li>
            <li className={c('row')}>
              <span className={c('row-label')}>{t('notifications.emailLabel')}</span>
              <label className={c('switch')}>
                <input
                  type="checkbox"
                  checked={prefs.notifEmailEnabled}
                  aria-label={t('notifications.emailLabel')}
                  onChange={(e) => void store.setEmailEnabled(e.target.checked)}
                />
                <span className={c('track')} />
              </label>
            </li>
          </ul>

          <div className={c('types-block', { 'types-block--disabled': allOff })}>
            <span className={c('types-label')}>{t('notifications.typesLabel')}</span>
            <span className={c('row-description')}>{t('notifications.typesHint')}</span>
            <ul className={c('rows')}>
              {MUTABLE_NOTIFICATION_TYPES.map((type) => (
                <li key={type} className={c('row row--with-description')}>
                  <div className={c('row-text')}>
                    <span className={c('row-label')}>{tk(`notifications.type.${type}`)}</span>
                    {type !== 'friend_requests' && type !== 'tour_updates' && (
                      <span className={c('row-description')}>
                        {tk(`notifications.typeDescription.${type}`)}
                      </span>
                    )}
                  </div>
                  <label className={c('switch', { 'switch--disabled': allOff })}>
                    <input
                      type="checkbox"
                      checked={!allOff && !isTypeMuted(type)}
                      aria-label={tk(`notifications.type.${type}`)}
                      disabled={allOff}
                      onChange={(e) => void store.setTypeMuted(type, !e.target.checked)}
                    />
                    <span className={c('track')} />
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {allOff && (
            <p className={c('disclaimer')} data-testid="all-off-hint">
              {t('notifications.allOffDisclaimer')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
