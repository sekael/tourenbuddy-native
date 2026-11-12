import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { color } from '@/core/theme/tokens';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  type TourType,
} from '@/features/tours/data/models/tour-type';

import { FALLBACK_COLOR } from './marker-palette';

/**
 * What the map's markers mean (map-integration "Legend"): one row per marker colour, named by the
 * activities wearing it (derived from the palette, so a palette change cannot leave it behind),
 * then the badges and the cluster.
 */
export function LegendSheet() {
  const { t } = useTranslation();
  const byColour = new Map<string, TourType[]>();
  for (const [type, colour] of Object.entries(TOUR_TYPE_COLORS) as [TourType, string][]) {
    byColour.set(colour, [...(byColour.get(colour) ?? []), type]);
  }
  return (
    <Screen>
      <Page title={t('map.legend.title')} onClose={() => router.back()}>
        <ListSection>
          {[...byColour].map(([colour, types]) => (
            <ListRow
              key={colour}
              title={types
                .map((type) => t(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}` as 'tours.type.hiking'))
                .join(', ')}
              icon="circle"
              iconColor={colour}
            />
          ))}
          <ListRow
            title={t('map.legend.multi')}
            icon="timeline"
            iconColor={TOUR_TYPE_COLORS.skitour}
          />
          <ListRow title={t('map.legend.none')} icon="circle" iconColor={FALLBACK_COLOR} />
        </ListSection>
        <ListSection>
          <ListRow title={t('map.legend.done')} icon="check_circle" iconColor={color.success} />
          <ListRow title={t('map.legend.friend')} icon="group" />
          <ListRow title={t('map.legend.linked')} icon="link" />
          <ListRow title={t('map.legend.cluster')} icon="layers" />
          <ListRow title={t('map.legend.chain')} icon="timeline" />
        </ListSection>
      </Page>
    </Screen>
  );
}
