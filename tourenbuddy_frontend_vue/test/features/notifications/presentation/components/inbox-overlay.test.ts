import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import InboxItem from '@/features/notifications/presentation/components/inbox-item.vue'
import InboxOverlay from '@/features/notifications/presentation/components/inbox-overlay.vue'

vi.mock('@/core/components/adaptive-overlay.vue', () => ({
  default: { template: '<div><slot name="header-actions" /><slot /></div>' },
}))

const read = {
  id: 'n1',
  type: 'tour_updates',
  action: 'updated',
  actorId: null,
  actorName: 'Jakob',
  tourId: null,
  tourName: 'Piz Ela',
  ref: {},
  occurrences: 1,
  readAt: '2026-10-01T00:00:00Z',
  createdAt: '2026-10-01T00:00:00Z',
}

describe('inboxOverlay', () => {
  it('should hide mark-all and hide "Load more" when nothing is unread and history ended', async () => {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: { inbox: { hasMore: false, isLoading: false, error: null } },
    })
    const { useInboxStore } = await import('@/features/notifications/presentation/stores/inbox-store')
    const store = useInboxStore(pinia)
    // @ts-expect-error — overriding a computed for the test
    store.entries = [read]
    const wrapper = mount(InboxOverlay, { global: { plugins: [pinia], stubs: { InboxItem: true } } })

    expect(wrapper.find('[data-testid="mark-all-read"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="load-more"]').exists()).toBe(false)
  })

  it('should show the empty state for an empty inbox', async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn, initialState: { inbox: { hasMore: false, isLoading: false, error: null } } })
    const wrapper = mount(InboxOverlay, { global: { plugins: [pinia], stubs: { InboxItem: true } } })

    expect(wrapper.find('[data-testid="inbox-empty"]').exists()).toBe(true)
  })

  it('should clear the inbox only after the inline confirmation', async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn, initialState: { inbox: { hasMore: false, isLoading: false, error: null } } })
    const { useInboxStore } = await import('@/features/notifications/presentation/stores/inbox-store')
    const store = useInboxStore(pinia)
    // @ts-expect-error — overriding a computed for the test
    store.entries = [read]
    const wrapper = mount(InboxOverlay, { global: { plugins: [pinia], stubs: { InboxItem: true } } })

    await wrapper.get('[data-testid="clear-inbox"]').trigger('click')
    expect(store.clearAll).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="clear-inbox-confirm"]').trigger('click')

    expect(store.clearAll).toHaveBeenCalledOnce()
  })

  async function mountWith(entry: Record<string, unknown>) {
    const pinia = createTestingPinia({ createSpy: vi.fn, initialState: { inbox: { hasMore: false, isLoading: false, error: null } } })
    const { useInboxStore } = await import('@/features/notifications/presentation/stores/inbox-store')
    const store = useInboxStore(pinia)
    // @ts-expect-error — overriding a computed for the test
    store.entries = [entry]
    const wrapper = mount(InboxOverlay, { global: { plugins: [pinia], stubs: { InboxItem: true } } })
    wrapper.findComponent(InboxItem).vm.$emit('open')
    await wrapper.vm.$nextTick()
    return { wrapper, store }
  }

  it('should open a known release note in place and mark it read', async () => {
    const { wrapper, store } = await mountWith({ ...read, type: 'release_notes', action: 'published', ref: { note_id: '2026-10-availability-reminders' } })
    expect(store.markRead).toHaveBeenCalledWith('n1')
    expect(wrapper.get('[data-testid="release-note-body"]').text()).toBe('releaseNotes.2026-10-availability-reminders.intro')
    expect(wrapper.emitted('open')).toBeUndefined()

    await wrapper.get('[data-testid="release-note-settings"]').trigger('click')
    expect(wrapper.emitted('openSettings')).toHaveLength(1)
  })

  it('should hand an unknown release note to the host, which reports it unavailable', async () => {
    const { wrapper, store } = await mountWith({ ...read, type: 'release_notes', action: 'published', ref: { note_id: 'gone-note' } })
    expect(store.markRead).toHaveBeenCalledWith('n1')
    expect(wrapper.find('[data-testid="release-note-body"]').exists()).toBe(false)
    expect(wrapper.emitted('open')).toHaveLength(1)
  })
})
