import { useEffect, useRef, useState } from 'react';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';

import { renderPdfThumbnail } from './pdf.web';
import styles from './tour-attachments-strip.module.css';
import { TourAttachmentUploadRow } from './tour-attachment-upload-row.web';

const c = classes(styles);

export function TourAttachmentsStrip({
  tourId,
  className,
  onOpenViewer,
}: {
  tourId: string;
  className?: string;
  onOpenViewer: (attachments: TourAttachment[], startIndex: number) => void;
}) {
  const attachments = useTourAttachmentsStore((s) => s.attachmentsByTour[tourId]) ?? [];
  /** A create-flow batch uploads against this tour id before any row exists (design D5). */
  const pending = useTourAttachmentsStore((s) => s.pendingByTour[tourId]) ?? [];
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const urls = useRef(thumbnailUrls);
  urls.current = thumbnailUrls;

  // Always resync: an insert accepted while the strip was away must show.
  useEffect(() => void useTourAttachmentsStore.getState().load(tourId), [tourId]);
  // Release object URLs (PDF thumbnails are data URLs and need no revoke).
  useEffect(
    () => () => {
      for (const url of Object.values(urls.current))
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    },
    [],
  );

  // Fetch thumbnails whenever the list changes.
  const listKey = attachments.map((a) => a.id).join();
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (const att of attachments) {
        if (urls.current[att.id]) continue;
        try {
          const url = await useTourAttachmentsStore.getState().localUri(att);
          let thumb = url;
          if (att.mimeType === 'application/pdf') {
            thumb = await renderPdfThumbnail(url);
            URL.revokeObjectURL(url);
          }
          if (alive) setThumbnailUrls((m) => ({ ...m, [att.id]: thumb }));
        } catch {
          // Thumbnail load failure is non-critical
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [listKey]);

  if (!pending.length && !attachments.length) return null;
  // One root, so a class from the sheet (its group divider) lands on it.
  return (
    <div className={className}>
      {pending.length > 0 && (
        <div className={c('strip__uploads')}>
          {pending.map((entry) => (
            <TourAttachmentUploadRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
      {attachments.length > 0 && (
        <div className={c('strip')}>
          {attachments.map((att, index) => (
            <button
              key={att.id}
              type="button"
              className={c('strip__item')}
              onClick={() => onOpenViewer(attachments, index)}
            >
              <div className={c('strip__thumb')}>
                {thumbnailUrls[att.id] ? (
                  <img
                    src={thumbnailUrls[att.id]}
                    alt={att.originalFilename}
                    className={c('strip__img')}
                  />
                ) : (
                  <BaseIcon
                    name={att.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'image'}
                    className={c('strip__pdf-icon')}
                  />
                )}
              </div>
              <span className={c('strip__label')}>{att.originalFilename}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
