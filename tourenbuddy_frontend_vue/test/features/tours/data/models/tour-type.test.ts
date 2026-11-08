import { describe, expect, it } from 'vitest'
import { iconRegistry } from '@/core/components/icons'
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_ICONS,
  TOUR_TYPE_PREVIEW_COLORS,
  TOUR_TYPE_VALUES,
} from '@/features/tours/data/models/tour-type'

describe('tour type colors', () => {
  it('should cover every TOUR_TYPE_VALUES entry with TOUR_TYPE_COLORS', () => {
    for (const type of TOUR_TYPE_VALUES) {
      expect(TOUR_TYPE_COLORS[type]).toBeDefined()
      expect(TOUR_TYPE_COLORS[type]).toMatch(/^#[\dA-F]{6}$/i)
    }
  })

  it('should cover every TOUR_TYPE_VALUES entry with TOUR_TYPE_PREVIEW_COLORS', () => {
    for (const type of TOUR_TYPE_VALUES) {
      expect(TOUR_TYPE_PREVIEW_COLORS[type]).toBeDefined()
      expect(TOUR_TYPE_PREVIEW_COLORS[type]).toMatch(/^#[\dA-F]{6}$/i)
    }
  })

  // An unregistered name renders nothing, silently — a typo would blank the type badge.
  it('should resolve every TOUR_TYPE_ICONS name in the icon registry', () => {
    for (const type of TOUR_TYPE_VALUES)
      expect(iconRegistry[TOUR_TYPE_ICONS[type]], type).toBeDefined()
  })
})
