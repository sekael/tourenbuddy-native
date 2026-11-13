import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ListSection, PickerRow } from '@/core/adaptive/list';
import type { Follow } from '@/features/map/domain/snap-network';

import { useMapStore } from './stores/map-store';

/**
 * What the planned or drawn line follows (track-drawing "Snap network"): the hiking trails, the ski
 * routes, or straight across. The chosen network shows on the map, so the user sees what the
 * line keeps to.
 */
export function FollowSection({
  value,
  onChange,
  status,
}: {
  value: Follow;
  onChange: (value: Follow) => void;
  status: string;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const { overlays, toggleOverlay } = useMapStore.getState();
    if (value !== 'straight' && !overlays.includes(value)) toggleOverlay(value);
  }, [value]);
  return (
    <ListSection title={t('map.plan.follow.label')} footer={status}>
      <PickerRow
        title={t('map.plan.follow.label')}
        style="segmented"
        value={value}
        options={[
          { value: 'hiking', label: t('map.plan.follow.option.hiking') },
          { value: 'ski', label: t('map.plan.follow.option.ski') },
          { value: 'straight', label: t('map.plan.follow.option.straight') },
        ]}
        onChange={onChange}
      />
    </ListSection>
  );
}
