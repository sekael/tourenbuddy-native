import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContactsListSheet from '@/features/contacts/presentation/components/contacts-list-sheet.vue'

vi.mock('@/features/contacts/presentation/composables/use-contact-picker', () => ({
  useContactPicker: () => ({ isSupported: false, pickContacts: vi.fn() }),
}))

const { parseVCardFileMock } = vi.hoisted(() => ({ parseVCardFileMock: vi.fn() }))

vi.mock('@/features/contacts/presentation/composables/use-vcard-import', () => ({
  useVCardImport: () => ({ parseVCardFile: parseVCardFileMock }),
}))

const mockContacts = [
  {
    id: '1',
    userId: 'u-1',
    firstName: 'Anna',
    lastName: 'Meier',
    displayName: null,
    contactMethods: [
      {
        id: 'm-1',
        contactId: '1',
        methodType: 'phone',
        value: '+41 79 111 22 33',
        label: null,
        isPrimary: true,
      },
    ],
  },
  {
    id: '2',
    userId: 'u-1',
    firstName: 'Bob',
    lastName: null,
    displayName: null,
    contactMethods: [],
  },
]

const ContactDetailViewStub = {
  name: 'ContactDetailView',
  template: '<div data-testid="contact-detail" />',
  emits: ['update:mode'],
  props: ['contact', 'mode'],
  methods: {
    enterEditMode(this: { $emit: (e: string, v: string) => void }) {
      this.$emit('update:mode', 'edit')
    },
  },
}

const ContactDetailActionsStub = {
  name: 'ContactDetailActions',
  template: '<div data-testid="detail-actions" />',
  emits: ['edit', 'deleted'],
}

function mountSheet() {
  return mount(ContactsListSheet, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            contacts: { contacts: mockContacts, isLoading: false, error: null },
          },
        }),
      ],
      stubs: {
        ContactDetailView: ContactDetailViewStub,
        ContactDetailActions: ContactDetailActionsStub,
        ContactForm: {
          template: '<div data-testid="contact-form" />',
          emits: ['submit', 'cancel'],
        },
      },
    },
  })
}

describe('contactsListSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('list view', () => {
    it('should render contacts list with all contacts', () => {
      const wrapper = mountSheet()
      const rows = wrapper.findAll('.contact-row')
      expect(rows).toHaveLength(2)
    })

    it('should display contact name in each row', () => {
      const wrapper = mountSheet()
      const rows = wrapper.findAll('.contact-row')
      expect(rows[0]!.text()).toContain('Anna Meier')
      expect(rows[1]!.text()).toContain('Bob')
    })

    it('should not display phone number in list rows', () => {
      const wrapper = mountSheet()
      expect(wrapper.find('.contact-phone').exists()).toBe(false)
    })

    it('should display phone as subtitle when displayName is set', () => {
      const contactsWithDisplayName = [
        {
          id: '1',
          userId: 'u-1',
          firstName: 'Anna',
          lastName: 'Meier',
          displayName: 'Annie',
          contactMethods: [
            {
              id: 'm-1',
              contactId: '1',
              methodType: 'phone',
              value: '+41 79 111 22 33',
              label: null,
              isPrimary: true,
            },
          ],
        },
      ]
      const wrapper = mount(ContactsListSheet, {
        global: {
          plugins: [
            createTestingPinia({
              createSpy: vi.fn,
              stubActions: false,
              initialState: {
                contacts: { contacts: contactsWithDisplayName, isLoading: false, error: null },
              },
            }),
          ],
          stubs: {
            ContactDetailView: { template: '<div />' },
            ContactForm: { template: '<div />' },
          },
        },
      })
      const row = wrapper.find('.contact-row')
      expect(row.find('.contact-name').text()).toBe('Annie')
      expect(row.find('.contact-subtitle').text()).toBe('+41 79 111 22 33')
    })

    it('should display phone as subtitle when only firstName is set', () => {
      const wrapper = mountSheet()
      const rows = wrapper.findAll('.contact-row')
      // Anna Meier (firstName + lastName, phone present)
      expect(rows[0]!.find('.contact-subtitle').text()).toBe('+41 79 111 22 33')
    })

    it('should hide subtitle when contact has no phone', () => {
      const wrapper = mountSheet()
      const rows = wrapper.findAll('.contact-row')
      // Bob (no lastName, no phone)
      expect(rows[1]!.find('.contact-subtitle').exists()).toBe(false)
    })

    it('should show empty state when no contacts', () => {
      const wrapper = mount(ContactsListSheet, {
        global: {
          plugins: [
            createTestingPinia({
              createSpy: vi.fn,
              stubActions: false,
              initialState: {
                contacts: { contacts: [], isLoading: false, error: null },
              },
            }),
          ],
          stubs: {
            ContactDetailView: { template: '<div />' },
            ContactForm: { template: '<div />' },
          },
        },
      })
      expect(wrapper.find('.empty-state').exists()).toBe(true)
    })
  })

  describe('navigation', () => {
    it('should navigate to detail view when a contact row is clicked', async () => {
      const wrapper = mountSheet()
      await wrapper.findAll('.contact-row')[0]!.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="contact-detail"]').exists()).toBe(true)
    })

    it('should navigate to add view when add button is clicked', async () => {
      const wrapper = mountSheet()
      await wrapper.find('[data-testid="add-contact-btn"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="contact-form"]').exists()).toBe(true)
    })

    it('should keep Edit out of the header and in the footer, and drop the footer while editing', async () => {
      const wrapper = mountSheet()
      await wrapper.findAll('.contact-row')[0]!.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.header, .dialog-header').find('[data-testid="edit-contact-btn"]').exists()).toBe(false)
      expect(wrapper.find('.footer, .dialog-footer').find('[data-testid="detail-actions"]').exists()).toBe(true)

      await wrapper.findComponent(ContactDetailActionsStub).vm.$emit('edit')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="detail-actions"]').exists()).toBe(false)
    })

    it('should return to list and clear selection when the footer reports the contact deleted', async () => {
      const wrapper = mountSheet()
      await wrapper.findAll('.contact-row')[0]!.trigger('click')
      await wrapper.vm.$nextTick()

      await wrapper.findComponent(ContactDetailActionsStub).vm.$emit('deleted')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.contact-row').exists()).toBe(true)
      expect(wrapper.find('[data-testid="contact-detail"]').exists()).toBe(false)
    })

    it('should return to list when selected contact is removed from the store', async () => {
      const wrapper = mountSheet()
      await wrapper.findAll('.contact-row')[0]!.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="contact-detail"]').exists()).toBe(true)

      // Simulate store removing the contact (e.g. after delete completes)
      const { useContactsStore: getStore }
        = await import('@/features/contacts/presentation/stores/contacts-store')
      const store = getStore()
      store.contacts = store.contacts.filter((c: { id: string }) => c.id !== '1')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="contact-detail"]').exists()).toBe(false)
      expect(wrapper.find('.contact-row').exists()).toBe(true)
    })
  })

  describe('import results: discarded phone numbers', () => {
    async function showResults(wrapper: ReturnType<typeof mountSheet>, contacts: Array<Record<string, unknown>>) {
      parseVCardFileMock.mockResolvedValueOnce(contacts)
      await wrapper.find('[data-testid="add-contact-btn"]').trigger('click')
      const input = wrapper.find('input[type="file"]')
      Object.defineProperty(input.element, 'files', {
        value: [new File(['x'], 'contacts.vcf')],
        configurable: true,
      })
      await input.trigger('change')
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()
    }

    it('should use error tone when the contact was skipped because no phone was usable', async () => {
      const wrapper = mountSheet()
      await showResults(wrapper, [
        { firstName: 'Not', lastName: 'Number', phones: [], rawPhoneNumbers: ['something else'] },
      ])

      const row = wrapper.find('.result-phone-warning')
      expect(row.exists()).toBe(true)
      expect(row.text()).toContain('contacts.list.invalidPhoneWarning')
      expect(wrapper.find('.result-phone-discarded').exists()).toBe(false)
    })

    it('should suppress the phone notice entirely when the contact was skipped as a duplicate', async () => {
      const wrapper = mountSheet()
      // 'Anna Meier' is already in the store, so re-importing her skips on nameDuplicate
      await showResults(wrapper, [
        { firstName: 'Anna', lastName: 'Meier', phones: [], rawPhoneNumbers: ['not a phone number'] },
      ])

      expect(wrapper.find('.result-phone-warning').exists()).toBe(false)
      expect(wrapper.find('.result-phone-discarded').exists()).toBe(false)
      expect(wrapper.find('.result-badge').text()).toBe('contacts.list.skippedLabel')
    })

    it('should use the milder discarded tone when the contact was imported anyway', async () => {
      const wrapper = mountSheet()
      await showResults(wrapper, [
        {
          firstName: 'One',
          lastName: 'Valid',
          phones: [{ value: '+41 79 000 12 34', label: null, isPrimary: true }],
          rawPhoneNumbers: ['not a phone number'],
        },
      ])

      const row = wrapper.find('.result-phone-discarded')
      expect(row.exists()).toBe(true)
      expect(row.text()).toContain('contacts.addDialog.discardedPhones')
      expect(wrapper.find('.result-phone-warning').exists()).toBe(false)
    })
  })

  describe('file import failures', () => {
    async function selectFile(wrapper: ReturnType<typeof mountSheet>) {
      await wrapper.find('[data-testid="add-contact-btn"]').trigger('click')
      const input = wrapper.find('input[type="file"]')
      Object.defineProperty(input.element, 'files', {
        value: [new File(['x'], 'contacts.vcf')],
        configurable: true,
      })
      await input.trigger('change')
      await wrapper.vm.$nextTick()
    }

    it('should show the reason-specific message and stay on the add form when the file is not a vCard', async () => {
      const { VCardImportError } = await import('@/core/exceptions')
      parseVCardFileMock.mockRejectedValueOnce(new VCardImportError('notVCard'))

      const wrapper = mountSheet()
      await selectFile(wrapper)

      expect(wrapper.find('.error-text').text()).toBe('contacts.addDialog.fileError.notVCard')
      expect(wrapper.find('.results-view').exists()).toBe(false)
    })

    it('should fall back to the generic message for a non-vCard error', async () => {
      parseVCardFileMock.mockRejectedValueOnce(new Error('boom'))

      const wrapper = mountSheet()
      await selectFile(wrapper)

      expect(wrapper.find('.error-text').text()).toBe('boom')
      expect(wrapper.find('.results-view').exists()).toBe(false)
    })
  })

  describe('close', () => {
    it('should emit close when bottom sheet close button clicked in list view', async () => {
      const wrapper = mountSheet()
      await wrapper.find('[aria-label="core.drawer.close"], [aria-label="Close"]').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('should navigate back to list (not close) when in detail view and close is pressed', async () => {
      const wrapper = mountSheet()
      await wrapper.findAll('.contact-row')[0]!.trigger('click')
      await wrapper.vm.$nextTick()

      await wrapper.find('[aria-label="core.drawer.close"], [aria-label="Close"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('close')).toBeFalsy()
      expect(wrapper.find('.contact-row').exists()).toBe(true)
    })
  })
})
