import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { ListRow, ListSection } from '@/core/adaptive/list';
import { createLogger } from '@/core/logging/logger';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { COLLISION_RADIUS_M, sharesActivity } from '@/features/tours/domain/collision';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { Tour } from '@/features/tours/domain/entities/tour';

import { useToursStore } from './stores/tours-store';

const log = createLogger('LinkedTours');

/**
 * Tour links on a tour's detail (tour-links): pending requests with Accept / Decline / Withdraw,
 * the tours it is linked with (own first, a friend's as "<friend>: <tour>"), and, on an own tour,
 * friends' tours with the same goal and activity that can be linked; friends already in another
 * linked group are named in a footer, since the server forbids merging groups.
 */
export function LinkedToursSection({
  tour,
  onOpenTour,
}: {
  tour: Tour;
  onOpenTour?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const siblings = useTourLinksStore((s) => s.siblingsByTourId.get(tour.id));
  const requests = useTourLinksStore((s) => s.requestsByTourId.get(tour.id));
  const groupIdByTourId = useTourLinksStore((s) => s.groupIdByTourId);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const friendUserIds = useFriendshipsStore((s) => s.friendUserIds);
  const contacts = useContactsStore((s) => s.contacts);
  const [busy, setBusy] = useState<string | null>(null);
  const isOwner = !tour.isFriendTour;

  // Realtime cannot deliver another group's member rows (RLS): reconcile on open.
  useEffect(() => {
    if (!isOwner) return;
    void useTourLinksStore.getState().fetchAll();
    void useToursStore.getState().loadFriendTours();
  }, [tour.id, isOwner]);

  const friendName = (userId: string) =>
    resolveFriendName(userId, phoneMap, (phone) =>
      contacts.length
        ? useContactsStore.getState().findContactByMethodValue('phone', phone)
        : undefined,
    ) ?? t('tourLinks.unknownPartner');
  const find = (id: string) =>
    tours.find((x) => x.id === id) ?? friendTours.find((x) => x.id === id) ?? null;
  const tourName = (x: Tour | null) => x?.name ?? t('tours.infoSheet.unnamedTour');

  async function run(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    try {
      await action();
    } catch (error) {
      log.error('Tour link action failed', error);
      Alert.alert(t('tourLinks.actionFailed'));
    } finally {
      setBusy(null);
    }
  }

  const ordered = [...(siblings ?? [])].sort(
    (a, b) => Number(!tours.some((x) => x.id === a)) - Number(!tours.some((x) => x.id === b)),
  );

  // Friends' tours with the same goal and activity, partitioned by whether the server can link
  // them (a merge of two different groups is forbidden).
  const linkable: Tour[] = [];
  const blocked: Tour[] = [];
  if (isOwner && tour.visibility === 'friends' && tour.tourTypes.length) {
    const myGroup = groupIdByTourId.get(tour.id);
    const pendingIds = new Set(
      (requests ?? []).flatMap((r) => [r.initiatorTourId, r.targetTourId]),
    );
    for (const f of friendTours) {
      if (!sharesActivity(f.tourTypes, tour.tourTypes) || f.visibility !== 'friends') continue;
      if (!friendUserIds.has(f.userId) || pendingIds.has(f.id)) continue;
      if (!isSameGoal(tour.goal, f.goal, COLLISION_RADIUS_M)) continue;
      const theirGroup = groupIdByTourId.get(f.id);
      if (!myGroup || !theirGroup) linkable.push(f);
      else if (theirGroup !== myGroup) blocked.push(f);
    }
  }

  const blockedNames = [...new Set(blocked.map((f) => friendName(f.userId)))].join(', ');

  return (
    <>
      {(requests ?? []).length > 0 ? (
        <ListSection>
          {(requests ?? []).map((request) => {
            const incoming = tours.some((x) => x.id === request.targetTourId);
            const other = find(incoming ? request.initiatorTourId : request.targetTourId);
            const name = other ? friendName(other.userId) : t('tourLinks.unknownPartner');
            const text = incoming
              ? t('tourLinks.bannerIncoming', { name, tour: tourName(other) })
              : t('tourLinks.bannerOutgoing', { name, tour: tourName(other) });
            const store = useTourLinksStore.getState();
            return incoming ? (
              <ListRow
                key={request.id}
                title={text}
                icon="link"
                disabled={busy === request.id}
                contextActions={[
                  {
                    label: t('tourLinks.acceptBtn'),
                    icon: 'check',
                    onPress: () => void run(request.id, () => store.acceptRequest(request.id)),
                  },
                  {
                    label: t('tourLinks.declineBtn'),
                    icon: 'close',
                    destructive: true,
                    onPress: () => void run(request.id, () => store.declineRequest(request.id)),
                  },
                ]}
                onPress={() =>
                  Alert.alert(t('tourLinks.collisionNoticeTitle'), text, [
                    {
                      text: t('tourLinks.declineBtn'),
                      style: 'destructive',
                      onPress: () => void run(request.id, () => store.declineRequest(request.id)),
                    },
                    {
                      text: t('tourLinks.acceptBtn'),
                      onPress: () => void run(request.id, () => store.acceptRequest(request.id)),
                    },
                  ])
                }
              />
            ) : (
              <ListRow
                key={request.id}
                title={text}
                icon="schedule"
                disabled={busy === request.id}
                swipeActions={[
                  {
                    label: t('tourLinks.withdrawBtn'),
                    icon: 'undo',
                    destructive: true,
                    onPress: () => void run(request.id, () => store.withdrawRequest(request.id)),
                  },
                ]}
                contextActions={[
                  {
                    label: t('tourLinks.withdrawBtn'),
                    icon: 'undo',
                    destructive: true,
                    onPress: () => void run(request.id, () => store.withdrawRequest(request.id)),
                  },
                ]}
              />
            );
          })}
        </ListSection>
      ) : null}

      {ordered.length > 0 ? (
        <ListSection title={t('tourLinks.linkedWithHeader')}>
          {ordered.map((id) => {
            const sibling = find(id);
            const own = tours.some((x) => x.id === id);
            const label = sibling
              ? own
                ? tourName(sibling)
                : `${friendName(sibling.userId)}: ${tourName(sibling)}`
              : `${t('tourLinks.unknownPartner')}: ${t('tours.infoSheet.unnamedTour')}`;
            return (
              <ListRow
                key={id}
                title={label}
                icon="link"
                disabled={!sibling}
                onPress={sibling && onOpenTour ? () => onOpenTour(id) : undefined}
              />
            );
          })}
        </ListSection>
      ) : null}

      {linkable.length > 0 || blocked.length > 0 ? (
        <ListSection
          title={t('tourLinks.collisionNoticeTitle')}
          footer={
            blocked.length > 0
              ? t('tourLinks.mergeBlockedBody', { names: blockedNames })
              : undefined
          }
        >
          {linkable.map((f) => (
            <ListRow
              key={f.id}
              title={t('tourLinks.requestToLinkBtn', { name: friendName(f.userId) })}
              subtitle={tourName(f)}
              icon="link"
              disabled={busy === f.id}
              onPress={() =>
                void run(f.id, () => useTourLinksStore.getState().createRequest(tour.id, f.id))
              }
            />
          ))}
        </ListSection>
      ) : null}
    </>
  );
}
