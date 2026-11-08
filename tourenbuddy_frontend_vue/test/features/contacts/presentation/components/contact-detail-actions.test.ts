import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContactDetailActions from '@/features/contacts/presentation/components/contact-detail-actions.vue'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'
import BlockConfirmDialog from '@/features/friendships/presentation/components/block-confirm-dialog.vue'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store'

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ currentUser: null, isAuthenticated: false }),
}))

const contact = {
  id: 'c-1',
  userId: 'u-1',
  firstName: 'Anna',
  lastName: 'Meier',
  displayName: null,
  updatedAt: null,
  contactMethods: [
    { id: 'm-1', contactId: 'c-1', methodType: 'phone' as const, value: '+41791234567', label: null, isPrimary: true, isValid: true },
  ],
}

function mountActions(linkedFriendUserId: string | null = null) {
  return mount(ContactDetailActions, {
    props: { contact, linkedFriendUserId },
    global: { plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })] },
  })
}

const testid = (id: string) => `[data-testid="${id}"]`

describe('contactDetailActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should order the row Delete, Block, Edit for a friend', () => {
    const ids = mountActions('u-2').findAll('.action-row button').map(b => b.attributes('data-testid'))
    expect(ids).toEqual(['delete-btn', 'block-btn', 'edit-contact-btn'])
  })

  it('should offer no Block for a contact that is no friend, or one already blocked', async () => {
    expect(mountActions().find(testid('block-btn')).exists()).toBe(false)
    const wrapper = mountActions('u-2')
    useUserBlocksStore().blocks = [{ blockerUserId: 'u-1', blockedUserId: 'u-2', unblockedAt: null }] as any
    await flushPromises()
    expect(wrapper.find(testid('block-btn')).exists()).toBe(false)
  })

  describe('delete', () => {
    it('should replace the row with the confirmation, and restore it on cancel', async () => {
      const wrapper = mountActions()
      await wrapper.find(testid('delete-btn')).trigger('click')
      expect(wrapper.find('.action-row').exists()).toBe(false)
      expect(wrapper.find('.delete-confirm-text').exists()).toBe(true)
      await wrapper.find(testid('delete-cancel-btn')).trigger('click')
      expect(wrapper.find(testid('delete-btn')).exists()).toBe(true)
    })

    it('should not delete the contact when ending the friendship fails', async () => {
      const wrapper = mountActions('u-2')
      vi.mocked(useFriendshipsStore().removeFriendship).mockRejectedValue(new Error('rpc failed'))
      await wrapper.find(testid('delete-btn')).trigger('click')
      await wrapper.find(testid('delete-confirm-btn')).trigger('click')
      await flushPromises()
      expect(useContactsStore().deleteContact).not.toHaveBeenCalled()
      expect(wrapper.emitted('deleted')).toBeFalsy()
      expect(wrapper.find('.error-text').text()).toBe('rpc failed')
    })

    it('should delete without touching friendships when no friend is linked', async () => {
      const wrapper = mountActions()
      vi.mocked(useContactsStore().deleteContact).mockResolvedValue({ queued: false, failed: false, value: undefined })
      await wrapper.find(testid('delete-btn')).trigger('click')
      await wrapper.find(testid('delete-confirm-btn')).trigger('click')
      await flushPromises()
      expect(useFriendshipsStore().removeFriendship).not.toHaveBeenCalled()
      expect(wrapper.emitted('deleted')).toHaveLength(1)
    })

    it.each([
      [{ hasPending: false, hasFriendship: false }, null],
      [{ hasPending: true, hasFriendship: false }, 'deletePendingWarning'],
      [{ hasPending: false, hasFriendship: true }, 'deleteFriendWarning'],
      [{ hasPending: true, hasFriendship: true }, 'deleteFriendAndPendingWarning'],
    ])('should warn for relationships %o', async (relationships, warning) => {
      const wrapper = mountActions()
      vi.mocked(useContactsStore().relationshipsForContact).mockResolvedValue(relationships)
      await wrapper.find(testid('delete-btn')).trigger('click')
      await flushPromises()
      const shown = wrapper.find('.delete-friend-warning')
      expect(shown.exists() ? shown.text() : null).toBe(warning && `contacts.detailView.${warning}`)
    })

    it('should warn about the friendship for a linked friend before relationships load', async () => {
      const wrapper = mountActions('u-2')
      vi.mocked(useContactsStore().relationshipsForContact).mockReturnValue(new Promise(() => {}))
      await wrapper.find(testid('delete-btn')).trigger('click')
      expect(wrapper.find('.delete-friend-warning').text()).toBe('contacts.detailView.deleteFriendWarning')
    })
  })

  it('should report the blocked user even after blocking unlinks the friend', async () => {
    const wrapper = mountActions('u-2')
    const blocks = useUserBlocksStore()
    // block_user ends the friendship; the parent's refetch drops the link mid-flight.
    vi.mocked(blocks.block).mockImplementation(async () => {
      await wrapper.setProps({ linkedFriendUserId: null })
    })
    await wrapper.find(testid('block-btn')).trigger('click')
    expect(wrapper.find('.action-row').exists()).toBe(false)
    wrapper.findComponent(BlockConfirmDialog).vm.$emit('confirm', 'spam')
    await flushPromises()
    expect(blocks.report).toHaveBeenCalledWith('u-2', 'spam')
  })
})
