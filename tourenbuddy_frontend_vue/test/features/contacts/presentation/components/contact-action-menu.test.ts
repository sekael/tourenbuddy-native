import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ContactActionMenu from '@/features/contacts/presentation/components/contact-action-menu.vue'

vi.mock('@/core/composables/use-is-desktop', () => ({
  useIsDesktop: vi.fn().mockReturnValue(false),
}))

const BottomSheetStub = {
  name: 'BottomSheet',
  template: '<div data-testid="bottom-sheet"><slot /></div>',
  props: ['title'],
  emits: ['close'],
}

const anchorRect = {
  top: 100,
  bottom: 132,
  left: 50,
  right: 150,
  width: 100,
  height: 32,
  x: 50,
  y: 100,
  toJSON: () => ({}),
} as DOMRect

function makeContact(
  methods: Array<{
    id: string
    value: string
    isPrimary: boolean
    isValid?: boolean
    label?: string | null
  }>,
) {
  return {
    id: 'c1',
    userId: 'u1',
    firstName: 'Anna',
    lastName: null,
    displayName: null,
    updatedAt: null,
    contactMethods: methods.map(m => ({
      id: m.id,
      contactId: 'c1',
      methodType: 'phone' as const,
      value: m.value,
      label: m.label ?? null,
      isPrimary: m.isPrimary,
      isValid: m.isValid ?? true,
    })),
  }
}

function mountMenu(contact: ReturnType<typeof makeContact>) {
  return mount(ContactActionMenu, {
    props: { contact, anchorRect },
    global: {
      stubs: {
        BottomSheet: BottomSheetStub,
        Teleport: { template: '<div><slot /></div>' },
      },
    },
  })
}

describe('contactActionMenu', () => {
  it('renders only Edit row when no valid methods', () => {
    const contact = makeContact([{ id: 'm1', value: 'bad', isPrimary: true, isValid: false }])
    const wrapper = mountMenu(contact)
    expect(wrapper.findAll('.method-row')).toHaveLength(0)
    expect(wrapper.find('.edit-row').exists()).toBe(true)
  })

  it('renders one row per valid method', () => {
    const contact = makeContact([
      { id: 'm1', value: '+41791111111', isPrimary: true },
      { id: 'm2', value: '+41792222222', isPrimary: false },
    ])
    const wrapper = mountMenu(contact)
    expect(wrapper.findAll('.method-row')).toHaveLength(2)
  })

  it('renders call and WhatsApp links for each method', () => {
    const contact = makeContact([{ id: 'm1', value: '+41791234567', isPrimary: true }])
    const wrapper = mountMenu(contact)
    expect(wrapper.find('a[href="tel:+41791234567"]').exists()).toBe(true)
    expect(wrapper.find('a[href="https://wa.me/41791234567"]').exists()).toBe(true)
  })

  it('emits editContact with contact id on edit click', async () => {
    const contact = makeContact([])
    const wrapper = mountMenu(contact)
    await wrapper.find('.edit-row').trigger('click')
    expect(wrapper.emitted('editContact')).toEqual([['c1']])
  })

  it('renders only valid method when list is mixed valid+invalid', () => {
    const contact = makeContact([
      { id: 'm1', value: '+41791234567', isPrimary: true, isValid: true },
      { id: 'm2', value: 'bad', isPrimary: false, isValid: false },
    ])
    const wrapper = mountMenu(contact)
    expect(wrapper.findAll('.method-row')).toHaveLength(1)
  })

  it('renders only Edit row for no-phone contact', () => {
    const contact = makeContact([])
    const wrapper = mountMenu(contact)
    expect(wrapper.findAll('.method-row')).toHaveLength(0)
    expect(wrapper.find('.edit-row').exists()).toBe(true)
  })
})
