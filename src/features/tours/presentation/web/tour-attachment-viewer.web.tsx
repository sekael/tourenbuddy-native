import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { createLogger } from '@/core/logging/logger';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';

import { openPdf, renderPdfPage, type PdfDocument } from './pdf.web';
import styles from './tour-attachment-viewer.module.css';

const c = classes(styles);
const log = createLogger('tour-attachment-viewer');

const NAV_THRESHOLD = 40;
const CLOSE_THRESHOLD = 80;

/** Full-screen viewer for a tour's images and PDFs: swipe or arrows between files, swipe down to close. */
export function TourAttachmentViewer({
  attachments,
  startIndex = 0,
  onClose,
}: {
  attachments: TourAttachment[];
  startIndex?: number;
  onClose: () => void;
}) {
  const { t } = useTranslation('web');
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const current = attachments[currentIndex];
  const prev = () => setCurrentIndex((i) => (i > 0 ? i - 1 : i));
  const next = () => setCurrentIndex((i) => (i < attachments.length - 1 ? i + 1 : i));

  // ── View URL (an object URL from the file cache), with one retry on an image error.
  const [viewUrl, setViewUrlState] = useState<string | null>(null);
  const viewUrlRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const retried = useRef(false);
  function setViewUrl(url: string | null) {
    if (viewUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(viewUrlRef.current);
    viewUrlRef.current = url;
    setViewUrlState(url);
  }
  const fetchUrl = () => useTourAttachmentsStore.getState().localUri(current!);

  useEffect(() => {
    if (!current) return;
    setViewUrl(null);
    setLoadError(false);
    retried.current = false;
    let alive = true;
    fetchUrl()
      .then((url) => (alive ? setViewUrl(url) : URL.revokeObjectURL(url)))
      .catch((err) => {
        log.error('view url failed', err);
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [currentIndex]);

  async function onImageError() {
    if (retried.current) {
      setLoadError(true);
      return;
    }
    retried.current = true;
    try {
      setViewUrl(await fetchUrl());
    } catch {
      setLoadError(true);
    }
  }

  async function downloadCurrent() {
    if (!current) return;
    try {
      const url = await fetchUrl();
      const a = document.createElement('a');
      a.href = url;
      a.download = current.originalFilename;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      log.error('download failed', err);
    }
  }

  // ── PDF rendering
  const pdfCanvas = useRef<HTMLCanvasElement>(null);
  const pdfDoc = useRef<PdfDocument | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const isPdf = current?.mimeType === 'application/pdf';

  async function renderPage(n: number) {
    if (!pdfDoc.current || !pdfCanvas.current) return;
    const canvas = pdfCanvas.current;
    await renderPdfPage(pdfDoc.current, n, canvas, () => window.devicePixelRatio || 1);
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
  }

  useEffect(() => {
    if (!viewUrl || !isPdf) return;
    void (async () => {
      setPdfLoading(true);
      setPdfPage(1);
      try {
        pdfDoc.current = await openPdf(viewUrl);
        setPdfTotalPages(pdfDoc.current.numPages);
        await renderPage(1);
      } catch (err) {
        log.error('PDF render failed', err);
        setLoadError(true);
      } finally {
        setPdfLoading(false);
      }
    })();
  }, [viewUrl, currentIndex]);

  function pdfGo(delta: number) {
    const n = pdfPage + delta;
    if (n < 1 || n > pdfTotalPages) return;
    setPdfPage(n);
    void renderPage(n);
  }

  // ── Swipe
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: TouchEvent) {
    touchStart.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    if (!start) return;
    touchStart.current = null;
    const dx = e.changedTouches[0]!.clientX - start.x;
    const dy = e.changedTouches[0]!.clientY - start.y;
    if (dy > 0 && dy > Math.abs(dx) && dy >= CLOSE_THRESHOLD) {
      onClose();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= NAV_THRESHOLD) {
      if (dx < 0) next();
      else prev();
    }
  }

  // ── Keyboard
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('keydown', onKeydown);
      setViewUrl(null);
    };
  }, []);

  return createPortal(
    <div
      className={c('viewer')}
      role="dialog"
      aria-modal="true"
      aria-label="Attachment viewer"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={c('viewer__header')}>
        <span className={c('viewer__filename')}>{current?.originalFilename}</span>
        <div className={c('viewer__header-actions')}>
          <button
            type="button"
            className={c('viewer__icon-btn')}
            aria-label={t('tours.attachments.download')}
            onClick={() => void downloadCurrent()}
          >
            <BaseIcon name="download" />
          </button>
          <button
            type="button"
            className={c('viewer__icon-btn')}
            aria-label="Close"
            onClick={onClose}
          >
            <BaseIcon name="close" />
          </button>
        </div>
      </div>

      <div className={c('viewer__content')}>
        {!viewUrl && !loadError ? (
          <div className={c('viewer__status')}>
            <span className={c('viewer__loading')} />
          </div>
        ) : loadError ? (
          <div className={c('viewer__status viewer__status--error')}>
            <BaseIcon name="broken_image" />
          </div>
        ) : !isPdf ? (
          <img
            src={viewUrl ?? ''}
            alt={current?.originalFilename}
            className={c('viewer__image')}
            onError={() => void onImageError()}
          />
        ) : (
          <div className={c('viewer__pdf-wrap')}>
            {pdfLoading && (
              <div className={c('viewer__status')}>
                <span className={c('viewer__loading')} />
              </div>
            )}
            <canvas ref={pdfCanvas} className={c('viewer__pdf-canvas')} />
            {pdfTotalPages > 1 && (
              <div className={c('viewer__pdf-nav')}>
                <button
                  type="button"
                  className={c('viewer__icon-btn')}
                  disabled={pdfPage <= 1}
                  onClick={() => pdfGo(-1)}
                >
                  <BaseIcon name="chevron_left" />
                </button>
                <span className={c('viewer__pdf-page')}>
                  {t('tours.attachments.viewer.page', { page: pdfPage, total: pdfTotalPages })}
                </span>
                <button
                  type="button"
                  className={c('viewer__icon-btn')}
                  disabled={pdfPage >= pdfTotalPages}
                  onClick={() => pdfGo(1)}
                >
                  <BaseIcon name="chevron_right" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {currentIndex > 0 && (
        <button
          type="button"
          className={c('viewer__nav viewer__nav--prev')}
          aria-label={t('tours.attachments.viewer.previous')}
          onClick={prev}
        >
          <BaseIcon name="chevron_left" />
        </button>
      )}
      {currentIndex < attachments.length - 1 && (
        <button
          type="button"
          className={c('viewer__nav viewer__nav--next')}
          aria-label={t('tours.attachments.viewer.next')}
          onClick={next}
        >
          <BaseIcon name="chevron_right" />
        </button>
      )}
      {attachments.length > 1 && (
        <div className={c('viewer__dots')} aria-hidden="true">
          {attachments.map((_, i) => (
            <span
              key={i}
              className={c('viewer__dot', { 'viewer__dot--active': i === currentIndex })}
            />
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
