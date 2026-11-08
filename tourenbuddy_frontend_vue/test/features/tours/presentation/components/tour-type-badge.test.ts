import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseIcon from '@/core/components/base-icon.vue'
import TourTypeBadge from '@/features/tours/presentation/components/tour-type-badge.vue'

describe('tourTypeBadge', () => {
  it('should show a neutral pin, no activity colour, for an untyped tour', () => {
    const w = mount(TourTypeBadge, { props: { types: [] } })
    expect(w.findComponent(BaseIcon).props('name')).toBe('location_on')
    expect(w.attributes('style')).toBeUndefined()
  })

  it('should keep two same-colour activities apart with a seam and an icon each', () => {
    const w = mount(TourTypeBadge, { props: { types: ['skitour', 'splitboarding'] } })
    expect(w.findAll('.slice-icon')).toHaveLength(2)
    expect(w.findAll('.seam')).toHaveLength(2)
  })

  it('should split two activities on the diagonal, the first one top-left', () => {
    const w = mount(TourTypeBadge, { props: { types: ['skitour', 'hiking'] } })
    const [first, second] = w.findAll('.slice-icon').map(i => i.element.style)
    expect(Number.parseFloat(first!.left)).toBeLessThan(50)
    expect(Number.parseFloat(first!.top)).toBeLessThan(50)
    expect(Number.parseFloat(second!.left)).toBeGreaterThan(50)
    expect(Number.parseFloat(second!.top)).toBeGreaterThan(50)
  })

  it('should not seam a single activity', () => {
    expect(mount(TourTypeBadge, { props: { types: ['hiking'] } }).findAll('.seam')).toHaveLength(0)
  })

  it('should count the activities past the third in a fourth slice once five glyphs would crowd', () => {
    const w = mount(TourTypeBadge, { props: { types: ['skitour', 'paragliding', 'hiking', 'mountaineering', 'climbing', 'mountain-biking'] } })
    expect(w.findAllComponents(BaseIcon).map(i => i.props('name'))).toEqual(['ski_touring', 'paragliding', 'hiking'])
    expect(w.find('.slice-more').text()).toBe('+3')
    expect(w.findAll('.seam')).toHaveLength(4)
  })

  it('should draw four activities as four glyphs, no count', () => {
    const w = mount(TourTypeBadge, { props: { types: ['skitour', 'paragliding', 'hiking', 'climbing'] } })
    expect(w.findAll('.slice-icon')).toHaveLength(4)
    expect(w.find('.slice-more').exists()).toBe(false)
  })
})
