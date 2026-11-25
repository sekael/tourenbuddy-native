import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createLogger } from '@/core/logging/logger';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import type { TourLinkRequest } from '@/features/tour-links/domain/entities/tour-link';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './link-request-banner.module.css';

const c = classes(styles);
const logger = createLogger('link-request-banner');

export function LinkRequestBanner({ request }: { request: TourLinkRequest }) {
  const { t } = useTranslation('web');
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const me = useAuthStore((s) => s.user?.id ?? null);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  useContactsStore((s) => s.contacts);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // A link request can arrive before the first friend-tours fetch: refresh on mount.
  useEffect(() => void useToursStore.getState().loadFriendTours(), []);

  /** Incoming = target tour is mine. Outgoing = initiator tour is mine. */
  const isIncoming = !!me && tours.find((x) => x.id === request.targetTourId)?.userId === me;
  const otherId = isIncoming ? request.initiatorTourId : request.targetTourId;
  const otherTour = friendTours.find((x) => x.id === otherId);
  const otherTourName = otherTour?.name ?? t('tours.infoSheet.unnamedTour');
  // The counterpart is a confirmed friend, so name them by the viewer's own contact.
  const otherFriendName = otherTour
    ? (resolveFriendName(otherTour.userId, phoneMap, (phone) =>
        useContactsStore.getState().findContactByMethodValue('phone', phone),
      ) ?? '')
    : '';

  const otherUserId = otherTour?.userId;
  useEffect(() => {
    if (otherUserId) void useFriendshipsStore.getState().ensurePhones([otherUserId]);
  }, [otherUserId]);

  async function run(action: 'acceptRequest' | 'declineRequest' | 'withdrawRequest') {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await useTourLinksStore.getState()[action](request.id);
    } catch (err) {
      logger.error(`${action} failed`, err);
      setSubmitError(err instanceof Error ? err.message : 'failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={c('link-request-banner', { 'link-request-banner--incoming': isIncoming })}>
      <div className={c('message')}>
        <BaseIcon name="link" className={c('icon')} />
        <span>
          {isIncoming
            ? t('tourLinks.bannerIncoming', { name: otherFriendName, tour: otherTourName })
            : t('tourLinks.bannerOutgoing', { name: otherFriendName, tour: otherTourName })}
        </span>
      </div>
      <div className={c('actions')}>
        {isIncoming ? (
          <>
            <BaseButton
              type="button"
              variant="primary"
              size="sm"
              disabled={submitting}
              onClick={() => void run('acceptRequest')}
            >
              {t('tourLinks.acceptBtn')}
            </BaseButton>
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={submitting}
              onClick={() => void run('declineRequest')}
            >
              {t('tourLinks.declineBtn')}
            </BaseButton>
          </>
        ) : (
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            disabled={submitting}
            onClick={() => void run('withdrawRequest')}
          >
            {t('tourLinks.withdrawBtn')}
          </BaseButton>
        )}
      </div>
      {submitError && <p className={c('error')}>{submitError}</p>}
    </section>
  );
}
