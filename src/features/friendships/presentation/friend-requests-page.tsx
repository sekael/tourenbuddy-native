import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { useFormatter } from '@/core/i18n/format';
import { createLogger } from '@/core/logging/logger';
import { formatPhoneForDisplay } from '@/core/utils/phone-normalize';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';

import { confirmBlockUser, unblockUser } from './block-user';
import { isPhoneVerified, useFriendshipsStore } from './stores/friendships-store';
import { unblockOpensAt, useUserBlocksStore } from './stores/user-blocks-store';

const log = createLogger('FriendRequests');

/**
 * Friend requests (friendships): requests to the user (accept, deny, block), the user's own
 * pending ones (cancel), and the users they block (unblock after the cooldown). Accepting adds
 * the new friend to the contacts when no contact has their number yet.
 */
export function FriendRequestsPage() {
  const { t } = useTranslation();
  const { formatDate } = useFormatter();
  const incoming = useFriendshipsStore((s) => s.incoming).filter((r) => r.status === 'pending');
  const outgoing = useFriendshipsStore((s) => s.outgoing).filter((r) => r.status === 'pending');
  const phones = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const names = useFriendshipsStore((s) => s.userIdToNamesMap);
  const contacts = useContactsStore((s) => s.contacts);
  const blocks = useUserBlocksStore((s) => s.blocks);
  const blockedInfo = useUserBlocksStore((s) => s.blockedUserInfo);
  const verified = isPhoneVerified();

  // Deleting a contact cancels its pending requests on the server: refetch with the contacts.
  useEffect(() => {
    void useFriendshipsStore.getState().fetchAll();
    void useUserBlocksStore.getState().fetchBlocks();
  }, [contacts]);

  const ids = [...incoming.map((r) => r.fromUserId), ...outgoing.map((r) => r.toUserId)].join(',');
  useEffect(() => {
    const all = ids.split(',').filter(Boolean);
    if (!all.length) return;
    const store = useFriendshipsStore.getState();
    void store.findPhonesByUserIds(all);
    void store.getNamesByUserIds(all);
  }, [ids]);

  const phoneOf = (userId: string) => {
    const phone = phones.get(userId);
    return phone ? formatPhoneForDisplay(phone) || phone : null;
  };
  /** A request's other side: the user's own contact for that number, else the name they gave. */
  const nameOf = (userId: string) => {
    const phone = phones.get(userId);
    const contact = phone
      ? useContactsStore.getState().findContactByMethodValue('phone', phone)
      : undefined;
    if (contact) return resolveContactName(contact);
    const entry = names.get(userId);
    return `${entry?.firstName ?? ''} ${entry?.lastName ?? ''}`.trim() || phoneOf(userId) || '…';
  };

  async function accept(requestId: string, userId: string) {
    const store = useFriendshipsStore.getState();
    try {
      await store.accept(requestId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await store.getNamesByUserIds([userId]);
      const phone = useFriendshipsStore.getState().userIdToPhoneMap.get(userId);
      const contacts = useContactsStore.getState();
      if (phone && !contacts.findContactByMethodValue('phone', phone)) {
        const entry = useFriendshipsStore.getState().userIdToNamesMap.get(userId);
        const first = entry?.firstName?.trim() || formatPhoneForDisplay(phone) || phone;
        await contacts.addContact(first, entry?.lastName?.trim() || null, null, [
          { value: phone, isPrimary: true },
        ]);
      }
    } catch (error) {
      log.error('Accept failed', error);
      Alert.alert(t('friendships.sendFailedRetry'));
    }
  }

  const act = (action: () => Promise<unknown>) => () =>
    void action().catch((error) => {
      log.error('Request action failed', error);
      Alert.alert(t('friendships.sendFailedRetry'));
    });

  if (!verified) {
    return (
      <Page title={t('friendships.friendsListLink')}>
        <EmptyState
          icon="lock"
          title={t('friendships.verifyPhoneHint')}
          actionLabel={t('shell.tabs.profile')}
          onAction={() => router.navigate('/profile')}
        />
      </Page>
    );
  }

  const empty = !incoming.length && !outgoing.length;

  return (
    <Page
      title={t('friendships.friendsListLink')}
      onRefresh={async () => {
        await Promise.all([
          useFriendshipsStore.getState().fetchAll(),
          useUserBlocksStore.getState().fetchBlocks(),
        ]);
      }}
    >
      {empty ? (
        <ListSection>
          <ListRow title={t('friendships.inboxEmpty')} icon="check_circle" chevron={false} />
        </ListSection>
      ) : null}
      {incoming.length ? (
        <ListSection
          title={t('friendships.requestFrom')}
          footer={t('friendships.inboxDenyRightsNote')}
        >
          {incoming.map((request) => (
            <ListRow
              key={request.id}
              title={nameOf(request.fromUserId)}
              subtitle={phoneOf(request.fromUserId) ?? undefined}
              icon="person_add"
              menu={[
                {
                  label: t('friendships.accept'),
                  icon: 'check_circle',
                  onPress: () =>
                    Alert.alert(t('friendships.acceptConfirm'), t('friendships.acceptWarning'), [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('friendships.accept'),
                        onPress: () => void accept(request.id, request.fromUserId),
                      },
                    ]),
                },
                {
                  label: t('friendships.deny'),
                  icon: 'close',
                  onPress: act(() => useFriendshipsStore.getState().deny(request.id)),
                },
                {
                  label: t('blocks.blockAction'),
                  icon: 'block',
                  destructive: true,
                  onPress: () => confirmBlockUser(t, request.fromUserId),
                },
              ]}
            />
          ))}
        </ListSection>
      ) : null}
      {outgoing.length ? (
        <ListSection title={t('friendships.requestTo')}>
          {outgoing.map((request) => (
            <ListRow
              key={request.id}
              title={nameOf(request.toUserId)}
              subtitle={phoneOf(request.toUserId) ?? undefined}
              icon="schedule"
              swipeActions={[
                {
                  label: t('friendships.cancel'),
                  icon: 'close',
                  destructive: true,
                  onPress: act(() => useFriendshipsStore.getState().cancel(request.id)),
                },
              ]}
              menu={[
                {
                  label: t('friendships.cancelRequest'),
                  icon: 'close',
                  destructive: true,
                  onPress: act(() => useFriendshipsStore.getState().cancel(request.id)),
                },
              ]}
            />
          ))}
        </ListSection>
      ) : null}
      <ListSection
        title={t('blocks.tabLabel')}
        footer={blocks.length ? undefined : t('blocks.emptyState')}
      >
        {blocks.map((block) => {
          const info = blockedInfo.get(block.blockedUserId);
          const name = `${info?.firstName ?? ''} ${info?.lastName ?? ''}`.trim();
          const phone = info?.phone ? formatPhoneForDisplay(info.phone) || info.phone : null;
          return (
            <ListRow
              key={block.blockedUserId}
              title={name || phone || '…'}
              subtitle={(() => {
                const opens = unblockOpensAt(block);
                return opens
                  ? t('blocks.unblockFrom', {
                      date: formatDate(opens, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })
                  : t('blocks.blockedSince', {
                      date: formatDate(block.lastBlockedAt, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }),
                    });
              })()}
              icon="block"
              menu={[
                {
                  label: t('blocks.unblockAction'),
                  icon: 'block',
                  onPress: () => void unblockUser(t, block.blockedUserId),
                },
              ]}
            />
          );
        })}
      </ListSection>
    </Page>
  );
}
