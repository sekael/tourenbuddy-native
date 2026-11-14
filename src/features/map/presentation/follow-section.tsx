import { useTranslation } from 'react-i18next';

import { ListSection, PickerRow } from '@/core/adaptive/list';
import type { Follow } from '@/features/map/domain/snap-network';

/**
 * What the planned or drawn line follows (track-drawing "Snap network"): the hiking trails, the ski
 * routes, or straight across. The map's overlays stay as the user set them (the router loads the
 * ways itself, shown or not); the chips over the map show or hide them during the step.
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
