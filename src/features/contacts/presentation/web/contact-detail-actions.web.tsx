import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useSnackbar } from '@/core/web/use-snackbar.web';
import type { Contact } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';
import { BlockConfirmDialog } from '@/features/friendships/presentation/web/block-confirm-dialog.web';

import styles from './contact-detail-actions.module.css';
import { useContactBlocked } from './use-contact-blocked.web';

const c = classes(styles);

/** The contact detail's footer: Delete · Block · Edit, confirmations in place of the row. */
export function ContactDetailActions({
  contact,
  linkedFriendUserId,
  onEdit,
  onDeleted,
}: {
  contact: Contact;
  linkedFriendUserId?: string | null;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const friendUserIds = useFriendshipsStore((s) => s.friendUserIds);
  // ponytail: the PWA shows these messages through a snackbar it never renders here; kept as is.
  const snackbar = useSnackbar();
  const isBlocked = useContactBlocked(contact, linkedFriendUserId);
  const canBlock = !!linkedFriendUserId && !isBlocked;

  const [deleteState, setDeleteState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [relationships, setRelationships] = useState<{
    hasPending: boolean;
    hasFriendship: boolean;
  } | null>(null);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);

  async function requestDelete() {
    setDeleteState('confirm');
    setRelationships(
      (await useContactsStore.getState().relationshipsForContact(contact.id)) ?? null,
    );
  }

  async function confirmDelete() {
    setDeleteError(null);
    setDeleteState('loading');
    try {
      if (linkedFriendUserId)
        await useFriendshipsStore.getState().removeFriendship(linkedFriendUserId);
      await useContactsStore.getState().deleteContact(contact.id);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('contacts.detailView.deleteFailed'));
      setDeleteState('idle');
    }
  }

  const deleteWarning =
    relationships?.hasFriendship && relationships.hasPending
      ? 'deleteFriendAndPendingWarning'
      : relationships?.hasFriendship || linkedFriendUserId
        ? 'deleteFriendWarning'
        : relationships?.hasPending
          ? 'deletePendingWarning'
          : null;

  async function confirmBlock(reportReason: string | null) {
    // Captured before awaiting: blocking ends the friendship, so the parent clears the id meanwhile.
    const target = linkedFriendUserId;
    if (!target) return;
    setBlockConfirmOpen(false);
    const blocks = useUserBlocksStore.getState();
    try {
      await blocks.block(target);
      snackbar.show(t('blocks.snackbar.blockSuccess'));
      if (reportReason !== null) {
        await blocks.report(target, reportReason);
        snackbar.show(t('blocks.snackbar.reportSuccess'));
      }
    } catch {
      snackbar.show(t('blocks.snackbar.sendRequestFailed'));
    }
  }

  return (
    <div className={c('detail-actions')}>
      {blockConfirmOpen && canBlock ? (
        <BlockConfirmDialog
          hasFriendship={friendUserIds.has(linkedFriendUserId)}
          onCancel={() => setBlockConfirmOpen(false)}
          onConfirm={(reason) => void confirmBlock(reason)}
        />
      ) : deleteState === 'confirm' ? (
        <div
          className={c('delete-confirm')}
          role="group"
          aria-label={t('contacts.detailView.deleteConfirm')}
        >
          <p className={c('delete-confirm-text')}>{t('contacts.detailView.deleteConfirm')}</p>
          {deleteWarning && (
            <p className={c('delete-friend-warning')}>
              <BaseIcon name="warning" className={c('warn-icon')} />
              {tk(`contacts.detailView.${deleteWarning}`)}
            </p>
          )}
          <div className={c('delete-confirm-row')}>
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              data-testid="delete-cancel-btn"
              onClick={() => setDeleteState('idle')}
            >
              {t('contacts.shared.cancelBtn')}
            </BaseButton>
            <BaseButton
              type="button"
              variant="danger"
              size="sm"
              data-testid="delete-confirm-btn"
              onClick={() => void confirmDelete()}
            >
              {t('contacts.detailView.deleteBtn')}
            </BaseButton>
          </div>
        </div>
      ) : (
        <>
          {deleteError && <p className={c('error-text')}>{deleteError}</p>}
          <div className={c('action-row')}>
            <BaseButton
              type="button"
              variant="danger-outline"
              size="sm"
              data-testid="delete-btn"
              disabled={deleteState === 'loading'}
              onClick={() => void requestDelete()}
            >
              {deleteState === 'loading'
                ? t('contacts.detailView.deletingBtn')
                : t('contacts.detailView.deleteAction')}
            </BaseButton>
            {canBlock && (
              <BaseButton
                type="button"
                variant="danger-outline"
                size="sm"
                data-testid="block-btn"
                onClick={() => setBlockConfirmOpen(true)}
              >
                {t('blocks.blockAction')}
              </BaseButton>
            )}
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              data-testid="edit-contact-btn"
              onClick={onEdit}
            >
              {t('contacts.detailView.editBtn')}
            </BaseButton>
          </div>
        </>
      )}
    </div>
  );
}
