import type { Contact } from '@/features/contacts/domain/entities/contact'
import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatPhoneDisplay } from '@/features/contacts/domain/entities/contact'
import ContactDetailView from '@/features/contacts/presentation/components/contact-detail-view.vue'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store'

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ currentUser: null, isAuthenticated: false }),
}))
vi.mock('@/features/friendships/data/repositories/friendship-repository-impl', () => ({
  FriendshipRepositoryImpl: vi.fn().mockImplementation(() => ({
    sendRequest: vi.fn(),
    accept: vi.fn(),
    deny: vi.fn(),
    cancel: vi.fn(),
    listIncoming: vi.fn().mockResolvedValue([]),
    listFriendships: vi.fn().mockResolvedValue([]),
    findUserByPhone: vi.fn(),
    findUsersByPhones: vi.fn(),
    findPhonesByUserIds: vi.fn().mockResolvedValue([]),
    removeFriendship: vi.fn(),
  })),
}))

const mockContact = {
  id: 'c-1',
  userId: 'u-1',
  firstName: 'Anna',
  lastName: 'Meier',
  displayName: null,
  updatedAt: null,
  contactMethods: [
    {
      id: 'm-1',
      contactId: 'c-1',
      methodType: 'phone' as const,
      value: '+41791234567',
      label: 'Mobile',
      isPrimary: true,
      isValid: true,
    },
  ],
}

const contactWithTwoPhones = {
  ...mockContact,
  contactMethods: [
    { id: 'm-1', contactId: 'c-1', methodType: 'phone' as const, value: '+41 79 111 22 33', label: null, isPrimary: true, isValid: true },
    { id: 'm-2', contactId: 'c-1', methodType: 'phone' as const, value: '+41 44 222 33 44', label: null, isPrimary: false, isValid: true },
  ],
}

function mountDetail(contact: Contact = mockContact, linkedFriendUserId: string | null = null) {
  return mount(ContactDetailView, {
    props: { contact, linkedFriendUserId },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })],
    },
  })
}

// Edit is the host's footer action; it calls the exposed enterEditMode.
async function enterEditMode(wrapper: ReturnType<typeof mountDetail>) {
  ;(wrapper.vm as unknown as { enterEditMode: () => void }).enterEditMode()
  await flushPromises()
}

describe('contactDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('view/edit mode toggle', () => {
    it('should default to view mode without name rows or fields', () => {
      const wrapper = mountDetail()
      expect(wrapper.find('#dv-firstName').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Anna')
      expect(wrapper.find('.hero').exists()).toBe(true)
    })

    it('should enter edit mode exposing inputs when Edit is clicked', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      expect(wrapper.find('#dv-firstName').exists()).toBe(true)
      expect((wrapper.find('#dv-firstName').element as HTMLInputElement).value).toBe('Anna')
      expect(wrapper.find('#dv-lastName').exists()).toBe(true)
    })

    it('should revert dirty name input to original value when Cancel is clicked', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      await wrapper.find('#dv-firstName').setValue('Annika')
      await wrapper.find('.form-actions .base-button--secondary').trigger('click')

      expect(wrapper.find('.hero').exists()).toBe(true)
      expect(wrapper.find('#dv-firstName').exists()).toBe(false)
      // The next edit starts from the original name again
      await enterEditMode(wrapper)
      expect((wrapper.find('#dv-firstName').element as HTMLInputElement).value).toBe('Anna')
    })

    it('should show add-method button and delete buttons only in edit mode', async () => {
      const wrapper = mountDetail()
      expect(wrapper.find('.add-method-btn').exists()).toBe(false)
      expect(wrapper.find('[data-testid="remove-method-btn"]').exists()).toBe(false)

      await enterEditMode(wrapper)
      expect(wrapper.find('.add-method-btn').exists()).toBe(true)
      expect(wrapper.find('[data-testid="remove-method-btn"]').exists()).toBe(true)
    })

    it('should make every primary-phone star non-interactive in view mode', () => {
      const wrapper = mountDetail(contactWithTwoPhones)
      // In view mode they render as spans (not buttons)
      expect(wrapper.findAll('.primary-star').map(s => s.element.tagName.toLowerCase())).toEqual(['span', 'span'])
    })

    it('should keep the primary star inert and only offer non-primary stars in edit mode', async () => {
      const wrapper = mountDetail(contactWithTwoPhones)
      await enterEditMode(wrapper)
      const stars = wrapper.findAll('.primary-star')
      expect(stars.map(s => s.element.tagName.toLowerCase())).toEqual(['span', 'button'])
    })

    it('should highlight only the primary row, and only when there are several phones', () => {
      const rows = mountDetail(contactWithTwoPhones).findAll('.phone-method .method-row')
      expect(rows.map(r => r.classes('method-row--primary'))).toEqual([true, false])
      expect(mountDetail().find('.method-row--primary').exists()).toBe(false)
    })
  })

  describe('save all (edit mode)', () => {
    it('should call updateContact and transition to view mode on success', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      vi.mocked(store.updateContact).mockResolvedValue(undefined as never)

      await enterEditMode(wrapper)
      await wrapper.find('#dv-firstName').setValue('Annika')
      await wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(store.updateContact).toHaveBeenCalledWith('c-1', {
        firstName: 'Annika',
        lastName: 'Meier',
        displayName: null,
      })
      // After success, back to view mode
      expect(wrapper.find('.hero').exists()).toBe(true)
      expect(wrapper.find('#dv-firstName').exists()).toBe(false)
    })

    it('should stay in edit mode and show error when updateContact fails', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      vi.mocked(store.updateContact).mockRejectedValue(new Error('DB error'))

      await enterEditMode(wrapper)
      await wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('#dv-firstName').exists()).toBe(true)
      expect(wrapper.find('.error-text').exists()).toBe(true)
    })

    it('disables Save (rather than allowing a submit that would error) when first name is empty', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      await wrapper.find('#dv-firstName').setValue('')

      const saveButton = wrapper.find('.form-actions .base-button--primary').element as HTMLButtonElement
      expect(saveButton.disabled).toBe(true)

      await wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('#dv-firstName').exists()).toBe(true)
    })
  })

  describe('commitPendingEdits', () => {
    it('should resolve immediately when in view mode', async () => {
      const wrapper = mountDetail()
      const vm = wrapper.vm as InstanceType<typeof ContactDetailView>

      await expect(vm.commitPendingEdits()).resolves.toBeUndefined()
    })

    it('should reject and stay in edit mode when a save fails', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      vi.mocked(store.updateContact).mockRejectedValue(new Error('save failed'))

      await enterEditMode(wrapper)
      const vm = wrapper.vm as InstanceType<typeof ContactDetailView>

      await expect(vm.commitPendingEdits()).rejects.toThrow()
      await flushPromises()

      expect(wrapper.find('#dv-firstName').exists()).toBe(true)
    })

    it('should resolve and return to view mode when all saves succeed', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      vi.mocked(store.updateContact).mockResolvedValue(undefined as never)

      await enterEditMode(wrapper)
      const vm = wrapper.vm as InstanceType<typeof ContactDetailView>

      await expect(vm.commitPendingEdits()).resolves.toBeUndefined()
      await flushPromises()

      expect(wrapper.find('.hero').exists()).toBe(true)
    })
  })

  describe('contact methods', () => {
    it('should display existing contact methods in view mode', () => {
      const wrapper = mountDetail()
      expect(wrapper.find('.method-row .view-value').text()).toBe(formatPhoneDisplay('+41791234567'))
    })

    it('should show empty methods message when no methods', () => {
      const wrapper = mountDetail({ ...mockContact, contactMethods: [] })
      expect(wrapper.find('.empty-methods').exists()).toBe(true)
    })

    it('should call removeMethodFromContact when delete icon clicked in edit mode', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()

      await enterEditMode(wrapper)
      await wrapper.find('[data-testid="remove-method-btn"]').trigger('click')
      expect(store.removeMethodFromContact).toHaveBeenCalledWith('c-1', 'm-1')
    })

    it('should call setPrimaryPhoneOnContact in edit mode when non-primary star clicked', async () => {
      const wrapper = mountDetail(contactWithTwoPhones)
      const store = useContactsStore()
      vi.mocked(store.setPrimaryPhoneOnContact).mockResolvedValue(undefined as never)

      await enterEditMode(wrapper)
      await wrapper.find('button.primary-star').trigger('click')

      expect(store.setPrimaryPhoneOnContact).toHaveBeenCalledWith('c-1', 'm-2')
    })

    it('should start fading the old highlight on click, before a slow save returns', async () => {
      const wrapper = mountDetail(contactWithTwoPhones)
      const store = useContactsStore()
      vi.mocked(store.setPrimaryPhoneOnContact).mockReturnValue(new Promise(() => {}))

      await enterEditMode(wrapper)
      await wrapper.find('button.primary-star').trigger('click')
      await flushPromises()

      expect(wrapper.find('.method-row--primary').exists()).toBe(false)
      // Rows only reorder after the fade-out.
      expect(wrapper.findAll('.phone-method input[type=tel]').map(i => (i.element as HTMLInputElement).value)[0]).toContain('111')
    })

    it('should ignore star taps while a switch is still saving', async () => {
      const wrapper = mountDetail({
        ...contactWithTwoPhones,
        contactMethods: [
          ...contactWithTwoPhones.contactMethods,
          { id: 'm-3', contactId: 'c-1', methodType: 'phone' as const, value: '+41 31 333 44 55', label: null, isPrimary: false, isValid: true },
        ],
      })
      const store = useContactsStore()
      vi.mocked(store.setPrimaryPhoneOnContact).mockReturnValue(new Promise(() => {}))

      await enterEditMode(wrapper)
      const [toM2, toM3] = wrapper.findAll('button.primary-star')
      await toM2!.trigger('click')
      await toM3!.trigger('click')

      expect(store.setPrimaryPhoneOnContact).toHaveBeenCalledTimes(1)
      expect(store.setPrimaryPhoneOnContact).toHaveBeenCalledWith('c-1', 'm-2')
    })

    it('should show error when setPrimaryPhoneOnContact fails in edit mode', async () => {
      const wrapper = mountDetail(contactWithTwoPhones)
      const store = useContactsStore()
      vi.mocked(store.setPrimaryPhoneOnContact).mockRejectedValue(new Error('RPC failed'))

      await enterEditMode(wrapper)
      await wrapper.find('button.primary-star').trigger('click')
      await flushPromises()

      expect(wrapper.find('.error-text').exists()).toBe(true)
    })
  })

  describe('add method', () => {
    it('should show add method form in edit mode after add button clicked', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      await wrapper.find('.add-method-btn').trigger('click')
      expect(wrapper.find('.add-method-form').exists()).toBe(true)
    })

    it('should show validation error if value is empty on add', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      await wrapper.find('.add-method-btn').trigger('click')
      await wrapper.find('.add-method-form .base-button--primary').trigger('click')
      expect(wrapper.find('.error-text').text()).toBe('contacts.detailView.valueRequired')
    })

    it('should discard add-method draft when Cancel is clicked from edit mode', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      await wrapper.find('.add-method-btn').trigger('click')
      expect(wrapper.find('.add-method-form').exists()).toBe(true)

      await wrapper.find('.form-actions .base-button--secondary').trigger('click')
      // Returned to view mode — add-method-form gone
      expect(wrapper.find('.add-method-form').exists()).toBe(false)
      expect(wrapper.find('.hero').exists()).toBe(true)
    })

    it('should save successfully after cancelling a blank, errored add-method draft', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      vi.mocked(store.updateContact).mockResolvedValue(undefined as never)

      await enterEditMode(wrapper)
      await wrapper.find('.add-method-btn').trigger('click')
      // Trigger the required-value error inside the add-method form
      await wrapper.find('.add-method-form .base-button--primary').trigger('click')
      expect(wrapper.find('.add-method-form .error-text').exists()).toBe(true)

      // Cancel the add-method draft (its own Cancel, not the outer form's)
      await wrapper.find('.add-method-form .base-button--secondary').trigger('click')
      expect(wrapper.find('.add-method-form').exists()).toBe(false)

      // Now save the contact via the outer form-level Save
      await wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('.hero').exists()).toBe(true)
      expect(wrapper.find('.error-text').exists()).toBe(false)
    })

    it('should show the duplicate disclaimer instead of inserting when the value already exists on another contact', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      const otherContact = { ...mockContact, id: 'c-2', firstName: 'Bob', lastName: null }
      vi.mocked(store.findContactByMethodValue).mockReturnValue(otherContact)

      await enterEditMode(wrapper)
      await wrapper.find('.add-method-btn').trigger('click')
      await wrapper.find('.add-method-form input[type="tel"]').setValue('+41 79 999 88 77')
      await wrapper.find('.add-method-form .base-button--primary').trigger('click')
      await flushPromises()

      expect(store.addMethodToContact).not.toHaveBeenCalled()
      expect(wrapper.find('.duplicate-disclaimer').exists()).toBe(true)
      expect(store.findContactByMethodValue).toHaveBeenCalledWith('phone', '+41799998877', 'c-1')
    })
  })

  describe('save button validation gate', () => {
    function saveBtn(wrapper: ReturnType<typeof mountDetail>) {
      return wrapper.find('.form-actions .base-button--primary').element as HTMLButtonElement
    }

    it('disables Save when the required first name is cleared, re-enabling once it is refilled', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      expect(saveBtn(wrapper).disabled).toBe(false)

      await wrapper.find('#dv-firstName').setValue('')
      expect(saveBtn(wrapper).disabled).toBe(true)

      await wrapper.find('#dv-firstName').setValue('Annika')
      expect(saveBtn(wrapper).disabled).toBe(false)
    })

    it('disables Save while a method phone value is invalid, re-enabling once fixed', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)

      await wrapper.find('.method-fields input[type="tel"]').setValue('123')
      expect(saveBtn(wrapper).disabled).toBe(true)

      await wrapper.find('.method-fields input[type="tel"]').setValue('+41 79 999 88 77')
      expect(saveBtn(wrapper).disabled).toBe(false)
    })

    it('disables Save while a method phone value is emptied, re-enabling once restored', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)

      await wrapper.find('.method-fields input[type="tel"]').setValue('')
      expect(saveBtn(wrapper).disabled).toBe(true)

      await wrapper.find('.method-fields input[type="tel"]').setValue('+41 79 999 88 77')
      expect(saveBtn(wrapper).disabled).toBe(false)
    })

    it('disables Save while the add-method form is open and blank, re-enabling once discarded', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      expect(saveBtn(wrapper).disabled).toBe(false)

      await wrapper.find('.add-method-btn').trigger('click')
      expect(saveBtn(wrapper).disabled).toBe(true)

      await wrapper.find('.add-method-form .base-button--secondary').trigger('click')
      expect(saveBtn(wrapper).disabled).toBe(false)
    })

    it('disables Save while the open add-method phone value is invalid, re-enabling once valid', async () => {
      const wrapper = mountDetail()
      await enterEditMode(wrapper)
      await wrapper.find('.add-method-btn').trigger('click')

      await wrapper.find('.add-method-form input[type="tel"]').setValue('123')
      expect(saveBtn(wrapper).disabled).toBe(true)

      await wrapper.find('.add-method-form input[type="tel"]').setValue('+41 79 999 88 77')
      expect(saveBtn(wrapper).disabled).toBe(false)
    })
  })

  describe('edit-evict warning', () => {
    it('shows the warning and blocks the update until confirmed, then removes the friendship after persisting', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      const friendships = useFriendshipsStore()
      vi.mocked(store.relationshipsForPhone).mockResolvedValue({
        hasFriendship: true,
        hasPending: false,
        userId: 'friend-1',
      })
      vi.mocked(store.updateMethodOnContact).mockResolvedValue(undefined as never)

      await enterEditMode(wrapper)
      await wrapper.find('.method-fields input[type="tel"]').setValue('+41 79 999 88 77')
      wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('.method-delete-confirm .delete-friend-warning').exists()).toBe(true)
      expect(store.updateMethodOnContact).not.toHaveBeenCalled()
      expect(friendships.removeFriendship).not.toHaveBeenCalled()

      await wrapper.find('.method-delete-confirm .base-button--primary').trigger('click')
      await flushPromises()

      expect(store.updateMethodOnContact).toHaveBeenCalledWith(
        'c-1',
        'm-1',
        expect.objectContaining({ value: '+41799998877' }),
      )
      expect(friendships.removeFriendship).toHaveBeenCalledWith('friend-1')
    })

    it('shows the pending-request warning without calling removeFriendship (pending termination is DB-owned)', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      const friendships = useFriendshipsStore()
      vi.mocked(store.relationshipsForPhone).mockResolvedValue({
        hasFriendship: false,
        hasPending: true,
        userId: 'pending-1',
      })
      vi.mocked(store.updateMethodOnContact).mockResolvedValue(undefined as never)

      await enterEditMode(wrapper)
      await wrapper.find('.method-fields input[type="tel"]').setValue('+41 79 999 88 77')
      wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('.method-delete-confirm .delete-friend-warning').exists()).toBe(true)

      await wrapper.find('.method-delete-confirm .base-button--primary').trigger('click')
      await flushPromises()

      expect(store.updateMethodOnContact).toHaveBeenCalled()
      expect(friendships.removeFriendship).not.toHaveBeenCalled()
    })

    it('cancelling the warning does not persist the update', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      const friendships = useFriendshipsStore()
      vi.mocked(store.relationshipsForPhone).mockResolvedValue({
        hasFriendship: true,
        hasPending: false,
        userId: 'friend-1',
      })

      await enterEditMode(wrapper)
      await wrapper.find('.method-fields input[type="tel"]').setValue('+41 79 999 88 77')
      wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('.method-delete-confirm .delete-friend-warning').exists()).toBe(true)

      await wrapper.find('.method-delete-confirm .base-button--secondary').trigger('click')
      await flushPromises()

      expect(store.updateMethodOnContact).not.toHaveBeenCalled()
      expect(friendships.removeFriendship).not.toHaveBeenCalled()
    })

    it('duplicate on the new value takes precedence — no eviction warning shown', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      const otherContact = { ...mockContact, id: 'c-2', firstName: 'Bob', lastName: null }
      vi.mocked(store.findContactByMethodValue).mockReturnValue(otherContact)

      await enterEditMode(wrapper)
      await wrapper.find('.method-fields input[type="tel"]').setValue('+41 79 999 88 77')
      await wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(store.relationshipsForPhone).not.toHaveBeenCalled()
      expect(wrapper.find('.duplicate-disclaimer').exists()).toBe(true)
      expect(wrapper.find('.method-delete-confirm').exists()).toBe(false)
      expect(store.updateMethodOnContact).not.toHaveBeenCalled()
    })

    it('does not call relationshipsForPhone when the phone value is unchanged', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      vi.mocked(store.updateContact).mockResolvedValue(undefined as never)

      await enterEditMode(wrapper)
      await wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(store.relationshipsForPhone).not.toHaveBeenCalled()
    })

    it('cancelling the warning aborts the whole Save-All attempt: name edit stays unsaved and pending, edit mode stays open, only the phone field resets', async () => {
      const wrapper = mountDetail()
      const store = useContactsStore()
      const friendships = useFriendshipsStore()
      vi.mocked(store.relationshipsForPhone).mockResolvedValue({
        hasFriendship: true,
        hasPending: false,
        userId: 'friend-1',
      })

      await enterEditMode(wrapper)
      await wrapper.find('#dv-firstName').setValue('Annika')
      await wrapper.find('.method-fields input[type="tel"]').setValue('+41 79 999 88 77')
      wrapper.find('.form-actions .base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('.method-delete-confirm .delete-friend-warning').exists()).toBe(true)

      await wrapper.find('.method-delete-confirm .base-button--secondary').trigger('click')
      await flushPromises()

      // Whole Save-All attempt aborted — nothing from this attempt was persisted
      expect(store.updateContact).not.toHaveBeenCalled()
      expect(store.updateMethodOnContact).not.toHaveBeenCalled()
      expect(friendships.removeFriendship).not.toHaveBeenCalled()

      // Still in edit mode, with the name edit preserved for a retry
      expect(wrapper.find('#dv-firstName').exists()).toBe(true)
      expect((wrapper.find('#dv-firstName').element as HTMLInputElement).value).toBe('Annika')

      // Only the phone field was reset, back to the original contact value
      expect((wrapper.find('.method-fields input[type="tel"]').element as HTMLInputElement).value).toBe(
        formatPhoneDisplay(mockContact.contactMethods[0]!.value),
      )
    })
  })

  describe('hero', () => {
    const hero = (wrapper: ReturnType<typeof mountDetail>) => ({
      subtitle: wrapper.find('[data-testid="hero-subtitle"]'),
      status: wrapper.find('[data-testid="hero-status"]'),
    })

    it('should show the full name only when a display name hides it', () => {
      expect(hero(mountDetail({ ...mockContact, displayName: 'Anna Meier' })).subtitle.exists()).toBe(false)
      expect(hero(mountDetail({ ...mockContact, displayName: 'Ännu' })).subtitle.text()).toBe('Anna Meier')
    })

    it('should show no avatar, and no identity line for a plain contact with nothing to say', () => {
      expect(mountDetail(mockContact, 'u-2').find('.hero-avatar').exists()).toBe(false)
      expect(mountDetail().find('.hero-identity').exists()).toBe(false)
    })

    it('should say "blocked" rather than "friend" for a blocked friend', async () => {
      const wrapper = mountDetail(mockContact, 'u-2')
      expect(hero(wrapper).status.text()).toBe('friendships.tooltip')
      useUserBlocksStore().blockedUserIds = new Set(['u-2']) as any
      await flushPromises()
      expect(hero(wrapper).status.text()).toBe('blocks.tooltip')
    })

    it('should call and message the first valid phone, primary first', () => {
      const wrapper = mountDetail({
        ...contactWithTwoPhones,
        contactMethods: [
          { ...contactWithTwoPhones.contactMethods[0]!, value: '079 111 22 33', isValid: false },
          { ...contactWithTwoPhones.contactMethods[1]!, value: '+41442223344' },
        ],
      })
      expect(wrapper.find('[data-testid="call-action"]').attributes('href')).toBe('tel:+41442223344')
      expect(wrapper.find('[data-testid="whatsapp-action"]').attributes('href')).toBe('https://wa.me/41442223344')
    })

    it('should render no quick actions without a valid phone or a friend, and no empty hero', () => {
      const wrapper = mountDetail({ ...mockContact, contactMethods: [{ ...mockContact.contactMethods[0]!, isValid: false }] })
      expect(wrapper.find('[data-testid="quick-actions"]').exists()).toBe(false)
      expect(wrapper.find('.hero').exists()).toBe(false)
    })

    it('should hide the hero while editing', async () => {
      const wrapper = mountDetail(mockContact, 'u-2')
      await enterEditMode(wrapper)
      expect(wrapper.find('.hero').exists()).toBe(false)
    })

    it('should show no star for a lone phone while reading, but one for each of two', () => {
      expect(mountDetail().find('.primary-star').exists()).toBe(false)
      expect(mountDetail(contactWithTwoPhones).findAll('.primary-star')).toHaveLength(2)
    })
  })

  // #362: a friend's tours one tap from their contact.
  describe('show friend tours', () => {
    const showTours = (wrapper: ReturnType<typeof mountDetail>) => wrapper.find('[data-testid="show-friend-tours"]')

    it('should not offer it for a contact that is no friend', () => {
      expect(showTours(mountDetail()).exists()).toBe(false)
    })

    it('should not offer it for a blocked friend', async () => {
      const wrapper = mountDetail(mockContact, 'u-2')
      useUserBlocksStore().blockedUserIds = new Set(['u-2']) as any
      await flushPromises()
      expect(showTours(wrapper).exists()).toBe(false)
    })

    it('should hide it while editing, and emit the friend\'s user id otherwise', async () => {
      const wrapper = mountDetail(mockContact, 'u-2')
      await showTours(wrapper).trigger('click')
      expect(wrapper.emitted('showTours')).toEqual([['u-2']])
      await enterEditMode(wrapper)
      expect(showTours(wrapper).exists()).toBe(false)
    })
  })
})
