import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { formatBytes } from '@/core/utils/format-bytes';
import { AdaptiveOverlay } from '@/core/web/adaptive-overlay.web';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { SWITZERLAND_BBOX } from '@/features/map/data/services/offline-tile-service.web';

import { offlineUsage, useOfflineMapStore, usedRatio } from './offline-map-store.web';
import styles from './offline-manage-sheet.module.css';

const c = classes(styles);

export function OfflineManageSheet({
  onClose,
  onStartDraw,
  onDownloadWhole,
}: {
  onClose: () => void;
  onStartDraw: () => void;
  onDownloadWhole: (bbox: [number, number, number, number]) => void;
}) {
  const { t } = useTranslation('web');
  const online = useStore(connectivity, (s) => s.online);
  const regions = useOfflineMapStore((s) => s.regions);
  const used = useOfflineMapStore(offlineUsage);
  const ratio = useOfflineMapStore(usedRatio);
  const quota = useOfflineMapStore((s) => s.quota);
  const durable = useOfflineMapStore((s) => s.durableStorageAvailable);
  useEffect(() => void useOfflineMapStore.getState().loadRegions(), []);

  return (
    <AdaptiveOverlay title={t('offlineMap.manage.title')} onClose={onClose}>
      <div className={c('body')}>
        {!durable && <p className={c('install-hint')}>{t('offlineMap.manage.installHint')}</p>}
        <div className={c('usage')}>
          <div className={c('bar')}>
            <div className={c('fill')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </div>
          <span className={c('usage-label')}>
            {t('offlineMap.manage.usage', { used: formatBytes(used), total: formatBytes(quota) })}
          </span>
        </div>
        {regions.length ? (
          <ul className={c('regions')}>
            {regions.map((r) => (
              <li key={r.id} className={c('region')}>
                <div className={c('region-info')}>
                  <span className={c('region-name')}>{r.label}</span>
                  <span className={c('region-meta')}>{formatBytes(r.bytes)}</span>
                </div>
                <button
                  type="button"
                  className={c('delete')}
                  aria-label={t('offlineMap.manage.delete')}
                  onClick={() => void useOfflineMapStore.getState().deleteRegion(r.id)}
                >
                  <BaseIcon name="delete" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={c('empty')}>{t('offlineMap.manage.empty')}</p>
        )}
        <p className={c('tip')}>{t('offlineMap.manage.tip')}</p>
        <div className={c('cta')}>
          <BaseButton variant="primary" disabled={!online} onClick={onStartDraw}>
            {t('offlineMap.manage.drawRegion')}
          </BaseButton>
          <BaseButton
            variant="secondary"
            disabled={!online}
            onClick={() => onDownloadWhole(SWITZERLAND_BBOX)}
          >
            {t('offlineMap.manage.wholeMap')}
          </BaseButton>
        </div>
      </div>
    </AdaptiveOverlay>
  );
}
