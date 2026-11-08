import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TourActionBar from '@/features/map/presentation/components/tour-action-bar.vue'

function mountBar(props: Partial<InstanceType<typeof TourActionBar>['$props']> = {}) {
  return mount(TourActionBar, {
    props: {
      visible: true,
      toursDisabled: false,
      addTourDisabled: false,
      ...props,
    },
  })
}

describe('tourActionBar', () => {
  it('should not render when visible is false', () => {
    const wrapper = mountBar({ visible: false })
    expect(wrapper.find('.pill').exists()).toBe(false)
  })

  it('should render pill with two segments when visible', () => {
    const wrapper = mountBar()
    expect(wrapper.find('.pill').exists()).toBe(true)
    expect(wrapper.findAll('.segment')).toHaveLength(2)
    expect(wrapper.find('.divider').exists()).toBe(true)
  })

  it('should emit tours when My Tours segment is clicked in enabled state', async () => {
    const wrapper = mountBar()
    await wrapper.find('.segment--tours').trigger('click')
    expect(wrapper.emitted('tours')).toHaveLength(1)
  })

  it('should emit addTour when Add-tour segment is clicked in enabled state', async () => {
    const wrapper = mountBar()
    await wrapper.find('.segment--add').trigger('click')
    expect(wrapper.emitted('addTour')).toHaveLength(1)
  })

  it('should render My Tours segment as disabled when toursDisabled', () => {
    const wrapper = mountBar({ toursDisabled: true })
    expect(wrapper.find('.segment--tours').attributes('disabled')).toBeDefined()
  })

  it('should render Add-tour segment as disabled when addTourDisabled', () => {
    const wrapper = mountBar({ addTourDisabled: true })
    expect(wrapper.find('.segment--add').attributes('disabled')).toBeDefined()
  })

  it('should apply aria-label to the Add-tour segment', () => {
    const wrapper = mountBar()
    const addBtn = wrapper.find('.segment--add')
    expect(addBtn.attributes('aria-label')).toBeTruthy()
  })

  it('should reach the segment when the click lands on the tooltip wrapper strip', async () => {
    const wrapper = mountBar()
    const strip = wrapper.find('.tooltip-wrapper')
    expect(strip.find('.segment--tours').exists()).toBe(true)
    await strip.find('.segment--tours').trigger('click')
    expect(wrapper.emitted('tours')).toHaveLength(1)
  })

  it('should emit nothing when a disabled segment envelope is clicked', async () => {
    const wrapper = mountBar({ toursDisabled: true, addTourDisabled: true })
    await wrapper.find('.segment--tours').trigger('click')
    await wrapper.find('.segment--add').trigger('click')
    expect(wrapper.emitted('tours')).toBeUndefined()
    expect(wrapper.emitted('addTour')).toBeUndefined()
  })

  it('should pass addTourTooltip to the add-tour BaseTooltip', () => {
    const wrapper = mountBar({ addTourTooltip: 'Sign in to add tours' })
    const tooltips = wrapper.findAllComponents({ name: 'BaseTooltip' })
    const addTooltip = tooltips[tooltips.length - 1]
    expect(addTooltip?.props('text')).toBe('Sign in to add tours')
  })
})
