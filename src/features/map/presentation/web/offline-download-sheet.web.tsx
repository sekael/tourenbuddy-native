import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatBytes } from '@/core/utils/format-bytes';
import { AdaptiveOverlay } from '@/core/web/adaptive-overlay.web';
import { BaseButton } from '@/core/web/base-button.web';
import { classes } from '@/core/web/classes';
import { suggestTourName } from '@/features/tours/data/services/swisstopo-name-service';

import styles from './offline-download-sheet.module.css';
import {
  estimateBlocks,
  estimateWarns,
  useOfflineMapStore,
  type Bbox,
} from './offline-map-store.web';

const c = classes(styles);

export function OfflineDownloadSheet({
  bbox,
  onClose,
  onDone,
}: {
  bbox: Bbox;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('web');
  const estimate = useOfflineMapStore((s) => s.estimate);
  const warns = useOfflineMapStore(estimateWarns);
  const blocks = useOfflineMapStore(estimateBlocks);
  const running = useOfflineMapStore((s) => s.status === 'running');
  const progress = useOfflineMapStore((s) => s.progress);
  const [label, setLabel] = useState('');
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  // Prefill the name from the region center (same reverse-geocode as add-location); fall back to coords.
  useEffect(() => {
    useOfflineMapStore.getState().updateEstimate(bbox);
    const center = { lng: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
    void suggestTourName(center).then((name) =>
      setLabel(name ?? `${center.lat.toFixed(3)}, ${center.lng.toFixed(3)}`),
    );
  }, []);

  async function start() {
    const ok = await useOfflineMapStore
      .getState()
      .download(label.trim() || t('offlineMap.download.untitled'), bbox);
    if (ok) onDone();
  }

  return (
    <AdaptiveOverlay title={t('offlineMap.download.title')} onClose={onClose}>
      <div className={c('body')}>
        <label className={c('field')}>
          <span className={c('field-label')}>{t('offlineMap.download.nameLabel')}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            type="text"
            className={c('input')}
            disabled={running}
          />
        </label>
        <p className={c('size', { warn: warns, block: blocks })}>
          {t('offlineMap.download.estimate', { size: formatBytes(estimate) })}
          {blocks ? (
            <span className={c('note')}>{t('offlineMap.download.tooLarge')}</span>
          ) : warns ? (
            <span className={c('note')}>{t('offlineMap.download.nearQuota')}</span>
          ) : null}
        </p>
        {running ? (
          <div className={c('progress')}>
            <div className={c('bar')}>
              <div className={c('fill')} style={{ width: `${percent}%` }} />
            </div>
            <span className={c('pct')}>
              {percent}% · {formatBytes(progress.bytes)}
            </span>
            <BaseButton
              variant="secondary"
              onClick={() => useOfflineMapStore.getState().cancelDownload()}
            >
              {t('offlineMap.download.cancel')}
            </BaseButton>
          </div>
        ) : (
          <BaseButton variant="primary" disabled={blocks} onClick={() => void start()}>
            {t('offlineMap.download.start')}
          </BaseButton>
        )}
      </div>
    </AdaptiveOverlay>
  );
}
