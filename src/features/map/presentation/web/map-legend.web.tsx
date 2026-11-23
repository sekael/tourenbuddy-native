import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import {
  cssFill,
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  type TourType,
} from '@/features/tours/data/models/tour-type';

import styles from './map-legend.module.css';
import { FALLBACK_COLOR } from './pie-marker.web';

const c = classes(styles);

// One row per marker colour, named by the activities wearing it: derived from the palette.
const typesByColour = new Map<string, TourType[]>();
for (const [type, color] of Object.entries(TOUR_TYPE_COLORS) as [TourType, string][])
  typesByColour.set(color, [...(typesByColour.get(color) ?? []), type]);
// The most common pairing: a ski tour with a hike to the start.
const splitFill = cssFill([TOUR_TYPE_COLORS.skitour, TOUR_TYPE_COLORS.hiking]);
const clusterFill = `conic-gradient(${[...typesByColour.keys()]
  .map((color, i, all) => `${color} ${(i * 100) / all.length}% ${((i + 1) * 100) / all.length}%`)
  .join(', ')})`;

/** The map legend: marker colours, badges, clusters, outing chains. */
export function MapLegend() {
  const { t } = useTranslation('web');
  const colourRows = [...typesByColour].map(([color, types]) => ({
    color,
    label: types.map((type) => t(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}` as never)).join(', '),
  }));
  return (
    <ul className={c('legend')}>
      {colourRows.map((row) => (
        <li key={row.color}>
          <span className={c('dot')} style={{ background: row.color }} />
          {row.label}
        </li>
      ))}
      <li>
        <span className={c('dot')} style={{ background: splitFill }} />
        {t('map.legend.multi')}
      </li>
      <li>
        <span className={c('dot')} style={{ background: FALLBACK_COLOR }} />
        {t('map.legend.none')}
      </li>
      <li>
        <span className={c('badge badge--done')}>
          <BaseIcon name="check" />
        </span>
        {t('map.legend.done')}
      </li>
      <li>
        <span className={c('badge')}>
          <BaseIcon name="group" />
        </span>
        {t('map.legend.friend')}
      </li>
      <li>
        <span className={c('badge')}>
          <BaseIcon name="link" />
        </span>
        {t('map.legend.linked')}
      </li>
      <li>
        <span className={c('cluster')} style={{ background: clusterFill }}>
          <span>3</span>
        </span>
        {t('map.legend.cluster')}
      </li>
      <li>
        <span className={c('chain')} />
        {t('map.legend.chain')}
      </li>
    </ul>
  );
}
