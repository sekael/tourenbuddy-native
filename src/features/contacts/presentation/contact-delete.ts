import * as Haptics from 'expo-haptics';
import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { createLogger } from '@/core/logging/logger';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';

import { useContactsStore } from './stores/contacts-store';

const log = createLogger('ContactDelete');

/**
 * Asks before deleting a contact (contacts), saying when that also ends a friendship or cancels
 * a pending request; deleting removes the linked friendship first.
 */
export async function confirmDeleteContact(t: TFunction, id: string, friend: string | null) {
  const relations = await useContactsStore
    .getState()
    .relationshipsForContact(id)
    .catch(() => ({ hasFriendship: false, hasPending: false }));
  const friendship = relations.hasFriendship || !!friend;
  const warning =
    friendship && relations.hasPending
      ? t('contacts.detailView.deleteFriendAndPendingWarning')
      : friendship
        ? t('contacts.detailView.deleteFriendWarning')
        : relations.hasPending
          ? t('contacts.detailView.deletePendingWarning')
          : undefined;
  Alert.alert(t('contacts.detailView.deleteConfirm'), warning, [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('contacts.detailView.deleteBtn'),
      style: 'destructive',
      onPress: () =>
        void (async () => {
          try {
            if (friend) await useFriendshipsStore.getState().removeFriendship(friend);
            await useContactsStore.getState().deleteContact(id);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            log.error('Delete contact failed', error);
            Alert.alert(t('contacts.detailView.deleteFailed'));
          }
        })(),
    },
  ]);
}
