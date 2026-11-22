import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { ListSection, ToggleRow } from '@/core/adaptive/list';
import type { Follow } from '@/features/map/domain/snap-network';

/**
 * Whether the planned or drawn line follows the ways (track-drawing, the PWA's switch): on, each
 * way follows the network of its own activities, a flown way straight; off, straight lines all
 * through. The footer says what each way follows. The map's overlays stay as the user set them.
 */
export function FollowSection({
  value,
  onChange,
  status,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  status: string;
}) {
  const { t } = useTranslation();
  return (
    <ListSection footer={status}>
      <ToggleRow
        title={t('map.plan.follow.label')}
        icon="route"
        value={value}
        onValueChange={onChange}
      />
    </ListSection>
  );
}

/**
 * What the line follows, in words: the one network ("Folgt den Wanderwegen"), each way's where
 * they differ ("Hinauf: Wanderwege · Hinunter: Luftlinie (geflogen)"), or why a leg went straight.
 * `down` is null for a route without a way down. Following, only a flown way is straight.
 */
export function followStatus(
  t: TFunction,
  state: {
    following: boolean;
    up: Follow;
    down: Follow | null;
    finding?: boolean;
    unavailable?: boolean;
    gap?: boolean;
  },
): string {
  const { following, up, down } = state;
  if (!following) return t('map.plan.follow.straight');
  if (state.finding) return t('map.plan.follow.finding');
  if (state.unavailable) return t('map.plan.follow.unavailable');
  if (state.gap) return t('map.plan.follow.gap');
  if (!down || down === up) {
    return up === 'straight' ? t('map.plan.follow.flown') : t(`map.plan.follow.${up}`);
  }
  const word = (way: Follow) =>
    way === 'straight' ? t('map.plan.follow.option.flown') : t(`map.plan.follow.option.${way}`);
  return t('map.plan.follow.perWay', { up: word(up), down: word(down) });
}
