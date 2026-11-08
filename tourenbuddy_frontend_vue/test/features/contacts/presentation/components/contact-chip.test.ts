import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ContactChip from '@/features/contacts/presentation/components/contact-chip.vue'

const contact = {
  id: 'c1',
  userId: 'u1',
  firstName: 'Anna',
  lastName: 'Meier',
  displayName: null,
  updatedAt: null,
  contactMethods: [],
}

describe('contactChip', () => {
  describe('select mode (default)', () => {
    it('emits toggle on click', async () => {
      const wrapper = mount(ContactChip, { props: { contact, selected: false } })
      await wrapper.find('button').trigger('click')
      expect(wrapper.emitted('toggle')).toEqual([['c1']])
      expect(wrapper.emitted('open')).toBeFalsy()
    })

    it('shows check icon when selected', () => {
      const wrapper = mount(ContactChip, { props: { contact, selected: true } })
      expect(wrapper.find('.check-icon').exists()).toBe(true)
    })

    it('hides check icon when not selected', () => {
      const wrapper = mount(ContactChip, { props: { contact, selected: false } })
      expect(wrapper.find('.check-icon').exists()).toBe(false)
    })
  })

  describe('action mode', () => {
    it('emits open with contact id and rect on click', async () => {
      const wrapper = mount(ContactChip, { props: { contact, selected: false, mode: 'action' } })
      await wrapper.find('button').trigger('click')
      const emitted = wrapper.emitted('open')
      expect(emitted).toHaveLength(1)
      expect(emitted![0]![0]).toBe('c1')
      expect(emitted![0]![1]).toBeInstanceOf(DOMRect)
      expect(wrapper.emitted('toggle')).toBeFalsy()
    })

    it('does not show check icon even when selected', () => {
      const wrapper = mount(ContactChip, { props: { contact, selected: true, mode: 'action' } })
      expect(wrapper.find('.check-icon').exists()).toBe(false)
    })

    it('does not render inline action icons', () => {
      const wrapper = mount(ContactChip, { props: { contact, selected: false, mode: 'action' } })
      expect(wrapper.find('.action-icon').exists()).toBe(false)
      expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false)
      expect(wrapper.find('a[href^="https://wa.me"]').exists()).toBe(false)
    })
  })

  it('displays contact display name', () => {
    const c = { ...contact, displayName: 'Annie' }
    const wrapper = mount(ContactChip, { props: { contact: c, selected: false } })
    expect(wrapper.text()).toContain('Annie')
  })
})
