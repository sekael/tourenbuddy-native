import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BlockCooldownError } from '@/core/exceptions';
import { formatPhoneForDisplay } from '@/core/utils/phone-normalize';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useSnackbar } from '@/core/web/use-snackbar.web';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import type { UserBlock } from '@/features/friendships/data/models/user-block-schemas';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';

import styles from './blocked-list.module.css';

const c = classes(styles);
const COOLDOWN_MS = 48 * 60 * 60 * 1000;

/** The people this user blocked, each with its unblock (after the 48 h cooldown). */
export function BlockedList() {
  const { t } = useTranslation('web');
  const blocks = useUserBlocksStore((s) => s.blocks);
  const blockedUserInfo = useUserBlocksStore((s) => s.blockedUserInfo);
  const contacts = useContactsStore((s) => s.contacts);
  // ponytail: the PWA shows these messages through a snackbar it never renders here; kept as is.
  const snackbar = useSnackbar();
  const activeBlocks = blocks.filter((b) => b.unblockedAt === null);
  // Read once, as the PWA's computed does.
  const [now] = useState(Date.now);

  const cooldownRemainingHours = (block: UserBlock) => {
    const remainingMs = new Date(block.lastBlockedAt).getTime() + COOLDOWN_MS - now;
    return remainingMs > 0 ? Math.ceil(remainingMs / (1000 * 60 * 60)) : 0;
  };

  function displayName(block: UserBlock): string {
    const info = blockedUserInfo.get(block.blockedUserId);
    const phone = info?.phone ?? null;
    if (phone) {
      const contact = contacts.find((x) =>
        x.contactMethods.some((m) => m.methodType === 'phone' && m.value === phone),
      );
      const name = `${contact?.firstName ?? ''} ${contact?.lastName ?? ''}`.trim();
      if (name) return name;
    }
    const profileName = `${info?.firstName ?? ''} ${info?.lastName ?? ''}`.trim();
    if (profileName) return profileName;
    return phone ? formatPhoneForDisplay(phone) || phone : '—';
  }

  async function handleUnblock(block: UserBlock) {
    try {
      await useUserBlocksStore.getState().unblock(block.blockedUserId);
      snackbar.show(t('blocks.snackbar.unblockSuccess'));
    } catch (err) {
      if (err instanceof BlockCooldownError)
        snackbar.show(
          t('blocks.snackbar.cooldownError', { hours: Math.ceil(err.remainingSeconds / 3600) }),
        );
    }
  }

  return (
    <div className={c('blocked-list')}>
      {activeBlocks.length === 0 ? (
        <div className={c('empty-state')}>{t('blocks.emptyState')}</div>
      ) : (
        <ul className={c('block-items')}>
          {activeBlocks.map((block) => {
            const hours = cooldownRemainingHours(block);
            return (
              <li key={block.blockedUserId} className={c('block-row')}>
                <div className={c('block-info')}>
                  <BaseIcon name="block" className={c('block-icon')} />
                  <div className={c('block-user-block')}>
                    <span className={c('block-user')}>{displayName(block)}</span>
                    <span className={c('block-since')}>
                      {t('blocks.blockedSince', {
                        date: new Date(block.firstBlockedAt).toLocaleDateString(),
                      })}
                    </span>
                  </div>
                </div>
                <div className={c('block-actions')}>
                  {hours > 0 && (
                    <span className={c('cooldown-label')}>
                      {t('blocks.cooldown.remaining', { hours })}
                    </span>
                  )}
                  <BaseButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={hours > 0}
                    onClick={() => void handleUnblock(block)}
                  >
                    {t('blocks.unblockAction')}
                  </BaseButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
