import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { BlockCooldownError } from '@/core/exceptions';
import { createLogger } from '@/core/logging/logger';

import { useFriendshipsStore } from './stores/friendships-store';
import { useUserBlocksStore } from './stores/user-blocks-store';

const log = createLogger('BlockUser');

/**
 * Asks before blocking (user-blocks): what the block ends, the 48-hour cooldown before an unblock,
 * and "Block and report" beside "Block". The report goes without a reason.
 */
export function confirmBlockUser(t: TFunction, userId: string) {
  const body = [
    useFriendshipsStore.getState().friendUserIds.has(userId)
      ? t('blocks.confirm.bodyWithFriend')
      : t('blocks.confirm.bodyWithoutFriend'),
    t('blocks.confirm.cooldownNotice'),
  ].join('\n\n');
  const block = async (report: boolean) => {
    try {
      const store = useUserBlocksStore.getState();
      await store.block(userId);
      if (report) await store.report(userId, null);
      Alert.alert(report ? t('blocks.snackbar.reportSuccess') : t('blocks.snackbar.blockSuccess'));
    } catch (error) {
      log.error('Block failed', error);
      Alert.alert(t('blocks.snackbar.sendRequestFailed'));
    }
  };
  Alert.alert(t('blocks.confirm.title'), body, [
    { text: t('blocks.confirm.cancelBtn'), style: 'cancel' },
    {
      text: t('blocks.confirm.reportAndBlock'),
      style: 'destructive',
      onPress: () => void block(true),
    },
    {
      text: t('blocks.confirm.confirmBtn'),
      style: 'destructive',
      onPress: () => void block(false),
    },
  ]);
}

/** Unblocks, or says how long the cooldown still runs. */
export async function unblockUser(t: TFunction, userId: string) {
  try {
    await useUserBlocksStore.getState().unblock(userId);
    Alert.alert(t('blocks.snackbar.unblockSuccess'));
  } catch (error) {
    Alert.alert(
      error instanceof BlockCooldownError
        ? t('blocks.snackbar.cooldownError', { hours: Math.ceil(error.remainingSeconds / 3600) })
        : t('blocks.snackbar.sendRequestFailed'),
    );
  }
}
