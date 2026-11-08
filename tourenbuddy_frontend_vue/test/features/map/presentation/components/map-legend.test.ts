import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MapLegend from '@/features/map/presentation/components/map-legend.vue'
import { TOUR_TYPE_COLORS, TOUR_TYPE_I18N_KEYS, TOUR_TYPE_VALUES } from '@/features/tours/data/models/tour-type'

describe('mapLegend', () => {
  it('should name every activity exactly once, in the row of its marker colour', () => {
    const rows = mount(MapLegend).findAll('li')
    for (const type of TOUR_TYPE_VALUES) {
      // The test i18n mock renders keys.
      const label = `tours.type.${TOUR_TYPE_I18N_KEYS[type]}`
      const matching = rows.filter(r => r.text().split(', ').includes(label))
      expect(matching, type).toHaveLength(1)
      expect(matching[0]!.find('.dot').attributes('style')).toContain(TOUR_TYPE_COLORS[type])
    }
  })
})
