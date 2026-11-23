import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import {
  useTourAttachmentsStore,
  type PendingUpload,
} from '@/features/tours/presentation/stores/tour-attachments-store';

import styles from './tour-attachment-upload-row.module.css';
import { UploadTile } from './upload-tile.web';

const c = classes(styles);

export function TourAttachmentUploadRow({ entry }: { entry: PendingUpload }) {
  const { t } = useTranslation('web');
  const online = useStore(connectivity, (s) => s.online);
  const store = useTourAttachmentsStore.getState();
  const failed = entry.status === 'failed';
  return (
    <UploadTile
      icon={failed ? 'warning' : 'upload_file'}
      filename={entry.filename}
      progress={entry.status === 'uploading' ? entry.progress : null}
      progressLabel={t('tours.attachments.uploading')}
      failed={failed}
      status={
        failed && (
          <span className={c('upload-row__failed')}>{t('tours.attachments.uploadFailed')}</span>
        )
      }
    >
      {entry.status === 'uploading' ? (
        <BaseIconButton
          name="close"
          label={t('tours.attachments.cancelUpload')}
          shape="square"
          size="sm"
          data-testid="upload-cancel"
          onClick={() => store.cancelUpload(entry.id)}
        />
      ) : (
        <>
          {/* Offline: disabled, never queued — attachment upload stays online-only (DC10). */}
          <BaseIconButton
            name="replay"
            label={t('tours.attachments.retryUpload')}
            shape="square"
            size="sm"
            disabled={!online}
            data-testid="upload-retry"
            onClick={() => void store.retryUpload(entry.id)}
          />
          <BaseIconButton
            name="delete"
            label={t('tours.attachments.dismissUpload')}
            shape="square"
            size="sm"
            tone="danger"
            data-testid="upload-dismiss"
            onClick={() => store.dismissUpload(entry.id)}
          />
        </>
      )}
    </UploadTile>
  );
}
