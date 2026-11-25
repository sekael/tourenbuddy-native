import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { localFileOf } from '@/core/web/local-file.web';
import { useHandleReorder } from '@/core/web/use-handle-reorder.web';
import { MAX_ATTACHMENTS_PER_TOUR } from '@/features/tours/data/models/tour-attachment';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';

import { TourAttachmentUploadRow } from './tour-attachment-upload-row.web';
import styles from './tour-attachments-picker.module.css';

const c = classes(styles);
const NO_PENDING: never[] = [];

/** The form's attachment list: pick, reorder by handle, delete with an inline confirm. */
export function TourAttachmentsPicker({
  tourId,
  draftId,
  uploadTourId,
  attachments,
  baseCount = 0,
  limitLabel,
}: {
  /** tourId for edit-flow; undefined during create-flow (use draftId). */
  tourId?: string;
  /** draftId for create-flow staging. */
  draftId?: string;
  /** Create-flow only: the pre-minted tour id picked files upload to right away (design D5). */
  uploadTourId?: string;
  attachments: TourAttachment[];
  /** Files the tour already holds that these ones ADD to (suggest mode). */
  baseCount?: number;
  /** Replaces the generic "limit reached" line when the caller can say something better. */
  limitLabel?: string;
}) {
  'use no memo';
  const { t } = useTranslation('web');
  const online = useStore(connectivity, (s) => s.online);
  const error = useTourAttachmentsStore((s) => s.error);
  const pendingKey = tourId ?? uploadTourId;
  const pending =
    useTourAttachmentsStore((s) => (pendingKey ? s.pendingByTour[pendingKey] : undefined)) ??
    NO_PENDING;
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmTarget, setConfirmTarget] = useState<TourAttachment | null>(null);
  /** In-flight files occupy slots too (design D7). */
  const occupied = attachments.length + pending.length + baseCount;
  const store = () => useTourAttachmentsStore.getState();

  async function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).map(localFileOf);
    event.target.value = ''; // the same file can be picked again after a rejection
    if (!files.length) return;
    // Create flow: upload now against the pre-minted tour id, like GPX (design D5).
    if (draftId && uploadTourId) await store().preUpload(draftId, uploadTourId, files);
    else if (draftId) store().stage(draftId, files, baseCount);
    else if (tourId) await store().add(tourId, files);
  }

  async function confirmDelete() {
    const target = confirmTarget;
    setConfirmTarget(null);
    if (!target) return;
    // Create flow: the file is in Storage but has no row yet (design D5).
    if (draftId && uploadTourId) await store().discardPreUploaded(draftId, target.id);
    else await store().remove(target);
  }

  const reorder = useHandleReorder((from, to) => {
    if (draftId) store().stageReorder(draftId, from, to);
    else if (tourId) {
      const ids = attachments.map((a) => a.id);
      ids.splice(to, 0, ...ids.splice(from, 1));
      void store().reorder(tourId, ids);
    }
  });

  return (
    <div className={c('picker')}>
      {error && (
        <p className={c('picker__error')} role="alert">
          {error}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className={c('picker__list')}>
          {attachments.map((attachment, index) => (
            <li
              key={attachment.id}
              className={c('picker__item', {
                'picker__item--confirm': confirmTarget?.id === attachment.id,
                'picker__item--dragging': reorder.from === index,
                'picker__item--over': reorder.over === index && reorder.from !== index,
              })}
              style={
                reorder.from === index
                  ? { transform: `translateY(${reorder.offset}px)` }
                  : undefined
              }
              data-reorder-index={index}
            >
              {/* Offline drops back to the normal row: a Delete that cannot run is not offered. */}
              {online && confirmTarget?.id === attachment.id ? (
                <div className={c('picker__confirm-actions')}>
                  <BaseButton variant="secondary" size="sm" onClick={() => setConfirmTarget(null)}>
                    {t('tours.infoSheet.cancelBtn')}
                  </BaseButton>
                  <BaseButton variant="danger" size="sm" onClick={() => void confirmDelete()}>
                    {t('tours.attachments.delete')}
                  </BaseButton>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className={c('picker__drag-handle')}
                    disabled={confirmTarget !== null}
                    aria-label={t('tours.attachments.reorderHandle', {
                      name: attachment.originalFilename,
                    })}
                    {...(confirmTarget === null
                      ? reorder.handleProps(index, attachments.length)
                      : {})}
                  >
                    <BaseIcon name="drag_indicator" />
                  </button>
                  <BaseIcon
                    name={attachment.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'image'}
                    className={c('picker__file-icon')}
                  />
                  <span className={c('picker__filename')}>{attachment.originalFilename}</span>
                  {/* Attachments are online-only (DC10): offline the control is absent. */}
                  {online && (
                    <BaseIconButton
                      name="delete"
                      label={t('tours.attachments.delete')}
                      shape="square"
                      size="sm"
                      tone="danger"
                      onClick={() => setConfirmTarget(attachment)}
                    />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <div className={c('picker__uploads')}>
          {pending.map((entry) => (
            <TourAttachmentUploadRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <div className={c('picker__add-row')}>
        {!online ? (
          <p className={c('picker__limit-reached')}>
            <BaseIcon name="cloud_off" size="sm" />
            {t('offlineSync.attachmentsOnlineOnly')}
          </p>
        ) : occupied < MAX_ATTACHMENTS_PER_TOUR ? (
          <BaseButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInput.current?.click()}
          >
            <BaseIcon name="attach_file" />
            {t('tours.attachments.add')}
          </BaseButton>
        ) : (
          <p className={c('picker__limit-reached')} data-testid="picker-limit">
            {limitLabel ?? t('tours.attachments.limitReached')}
          </p>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,application/pdf"
        className={c('picker__hidden-input')}
        onChange={(e) => void onFilesSelected(e)}
      />
    </div>
  );
}
