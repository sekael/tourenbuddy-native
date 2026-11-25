import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createLogger } from '@/core/logging/logger';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { TourLinksRepositoryImpl } from '@/features/tour-links/data/repositories/tour-links-repository-impl';
import type { BackfillCollisionPair } from '@/features/tour-links/domain/entities/tour-link';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './backfill-collisions-page.module.css';

const c = classes(styles);
const logger = createLogger('backfill-collisions-page');
const repository = new TourLinksRepositoryImpl();

/**
 * Tours of yours that overlap a friend's from before you were friends, each with a link request
 * to send: one friendship (the digest's deep link) or every friendship (embedded in the list).
 */
export function BackfillCollisionsPage({
  mode = 'friendship',
  onBack,
}: {
  /** 'friendship' = scoped to the route param; 'all' = scan every accepted friendship. */
  mode?: 'friendship' | 'all';
  onBack?: () => void;
}) {
  const { t } = useTranslation('web');
  const { friendshipId } = useLocalSearchParams<{ friendshipId?: string }>();
  const requestsByTourId = useTourLinksStore((s) => s.requestsByTourId);
  const groupIdByTourId = useTourLinksStore((s) => s.groupIdByTourId);
  const friendTours = useToursStore((s) => s.friendTours);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  useContactsStore((s) => s.contacts);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<BackfillCollisionPair[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const isAllMode = mode === 'all';

  /**
   * Drop pairs that are no longer actionable: a pending link request already exists between the
   * two tours, both tours now share a group, or the friend tour has disappeared from
   * `friendTours`. Belt-and-suspenders against stale rows the server-side scan didn't refresh.
   */
  const friendTourIds = new Set(friendTours.map((x) => x.id));
  const visiblePairs = pairs.filter((p) => {
    if (!friendTourIds.has(p.friendTourId)) return false;
    const yg = groupIdByTourId.get(p.yourTourId);
    const fg = groupIdByTourId.get(p.friendTourId);
    if (yg && fg && yg === fg) return false;
    const reqs = requestsByTourId.get(p.yourTourId) ?? [];
    return !reqs.some(
      (r) => r.initiatorTourId === p.friendTourId || r.targetTourId === p.friendTourId,
    );
  });

  useEffect(() => {
    // The tour-links cache reflects the server before the user acts: on first nav here the store
    // may have been hydrated minutes earlier.
    void useTourLinksStore.getState().fetchAll();
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        let found: BackfillCollisionPair[];
        if (mode === 'all') found = await repository.listAllBackfillCollisions();
        else {
          const id = String(friendshipId ?? '');
          if (!id) {
            setError('missing friendshipId');
            return;
          }
          found = await repository.listBackfillCollisionsForFriendship(id);
        }
        setPairs(found);
        // One batched lookup for both modes, so a friend is named the same way everywhere.
        const ownerIds = [...new Set(found.map((p) => p.friendUserId))];
        if (ownerIds.length > 0) await useFriendshipsStore.getState().ensurePhones(ownerIds);
      } catch (err) {
        logger.error('list backfill failed', err);
        setError(err instanceof Error ? err.message : 'failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function friendNameOf(pair: BackfillCollisionPair): string {
    const name = resolveFriendName(pair.friendUserId, phoneMap, (phone) =>
      useContactsStore.getState().findContactByMethodValue('phone', phone),
    );
    return name ?? t('tours.list.aFriend');
  }

  async function requestLink(pair: BackfillCollisionPair) {
    setSubmitting(pair.yourTourId);
    try {
      await useTourLinksStore.getState().createRequest(pair.yourTourId, pair.friendTourId);
      setPairs((all) =>
        all.filter(
          (p) => !(p.yourTourId === pair.yourTourId && p.friendTourId === pair.friendTourId),
        ),
      );
    } catch (err) {
      logger.error('createRequest failed', err);
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setSubmitting(null);
    }
  }

  function handleBack() {
    onBack?.();
    // Route mode (digest deep link) has no parent listener: back in history, or the map.
    if (mode === 'friendship') {
      if (router.canGoBack()) router.back();
      else router.replace('/map');
    }
  }

  return (
    <div className={c('page', { 'page--standalone': !isAllMode })}>
      <header className={c('page-header')}>
        <BaseIconButton
          name="arrow_back"
          label={t('core.drawer.back')}
          size="sm"
          onClick={handleBack}
        />
        <h1 className={c('title')}>{t('tourLinks.backfillPageTitle')}</h1>
      </header>

      {loading ? (
        <div className={c('state')}>{t('common.loading')}</div>
      ) : error ? (
        <div className={c('state state--error')}>{error}</div>
      ) : visiblePairs.length === 0 ? (
        <div className={c('state')}>
          {isAllMode ? t('tourLinks.backfillAllEmpty') : t('tourLinks.backfillEmpty')}
        </div>
      ) : (
        <ul className={c('list')}>
          {visiblePairs.map((pair) => (
            <li key={`${pair.yourTourId}-${pair.friendTourId}`} className={c('row')}>
              <dl className={c('fields')}>
                <div className={c('field')}>
                  <dt className={c('field-label')}>{t('tourLinks.backfillYourTourLabel')}</dt>
                  <dd className={c('field-value')}>
                    {pair.yourTourName ?? t('tours.infoSheet.unnamedTour')}
                  </dd>
                </div>
                {isAllMode && (
                  <div className={c('field')}>
                    <dt className={c('field-label')}>{t('tourLinks.backfillFriendNameLabel')}</dt>
                    <dd className={c('field-value field-value--muted')}>{friendNameOf(pair)}</dd>
                  </div>
                )}
                <div className={c('field')}>
                  <dt className={c('field-label')}>{t('tourLinks.backfillFriendTourLabel')}</dt>
                  <dd className={c('field-value')}>
                    {pair.friendTourName ?? t('tours.infoSheet.unnamedTour')}
                  </dd>
                </div>
              </dl>
              <BaseButton
                variant="primary-outline"
                size="sm"
                className={c('btn')}
                disabled={submitting !== null}
                onClick={() => void requestLink(pair)}
              >
                {submitting === pair.yourTourId
                  ? t('tourLinks.requestingBtn')
                  : t('tourLinks.requestToLinkShortBtn')}
              </BaseButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
