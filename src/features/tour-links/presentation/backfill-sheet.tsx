import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { createLogger } from '@/core/logging/logger';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import type { BackfillCollisionPair } from '@/features/tour-links/domain/entities/tour-link';

import { useTourLinksStore } from './stores/tour-links-store';

const log = createLogger('TourOverlaps');

/**
 * Tour overlaps with friends (tour-links "Backfill"): the user's tours a friend also plans (same
 * goal, same activity) that are not linked yet, each with "Request to link".
 */
export function BackfillSheet() {
  const { t } = useTranslation();
  const [pairs, setPairs] = useState<BackfillCollisionPair[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const contacts = useContactsStore((s) => s.contacts);

  useEffect(() => {
    void useTourLinksStore
      .getState()
      .listBackfill()
      .then((rows) => {
        setPairs(rows);
        void useFriendshipsStore
          .getState()
          .ensurePhones([...new Set(rows.map((r) => r.friendUserId))]);
      })
      .catch((error) => {
        log.error('Loading overlaps failed', error);
        setPairs([]);
      });
  }, []);

  const name = (userId: string) =>
    resolveFriendName(userId, phoneMap, (phone) =>
      contacts.length
        ? useContactsStore.getState().findContactByMethodValue('phone', phone)
        : undefined,
    ) ?? t('tourLinks.unknownPartner');

  async function request(pair: BackfillCollisionPair) {
    const key = `${pair.yourTourId}|${pair.friendTourId}`;
    try {
      await useTourLinksStore.getState().createRequest(pair.yourTourId, pair.friendTourId);
      setSent((s) => new Set(s).add(key));
    } catch (error) {
      log.error('Link request failed', error);
      Alert.alert(t('tourLinks.actionFailed'));
    }
  }

  const unnamed = t('tours.infoSheet.unnamedTour');
  return (
    <Screen>
      <Page title={t('tours.list.viewBackfillCollisionsBtn')} onClose={() => router.back()}>
        {pairs === null ? (
          <ListSection>
            <ListRow title={t('common.loading')} />
          </ListSection>
        ) : pairs.length === 0 ? (
          <EmptyState icon="sync_alt" title={t('tourLinks.backfillAllEmpty')} />
        ) : (
          pairs.map((pair) => {
            const key = `${pair.yourTourId}|${pair.friendTourId}`;
            return (
              <ListSection
                key={key}
                title={t('tourLinks.backfillFriendLabel', { name: name(pair.friendUserId) })}
              >
                <ListRow
                  title={pair.yourTourName ?? unnamed}
                  subtitle={t('tourLinks.backfillYourTourLabel')}
                  icon="tour"
                />
                <ListRow
                  title={pair.friendTourName ?? unnamed}
                  subtitle={t('tourLinks.backfillFriendTourLabel')}
                  icon="group"
                />
                <ListRow
                  title={
                    sent.has(key)
                      ? t('tourLinks.requestSent')
                      : t('tourLinks.requestToLinkShortBtn')
                  }
                  icon="link"
                  disabled={sent.has(key)}
                  onPress={() => void request(pair)}
                />
              </ListSection>
            );
          })
        )}
      </Page>
    </Screen>
  );
}
