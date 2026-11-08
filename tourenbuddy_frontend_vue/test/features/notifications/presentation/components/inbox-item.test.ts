import type { InboxNotification } from '@/features/notifications/domain/entities/inbox-notification'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import InboxItem from '@/features/notifications/presentation/components/inbox-item.vue'

const friend = vi.hoisted(() => ({ lookups: [] as (string | null)[] }))
const friendName = ref<string | null>(null)
const friendResolved = ref(true)
vi.mock('@/features/friendships/presentation/composables/use-friend-display-name', () => ({
  useFriendDisplayName: (id: () => string | null) => {
    friend.lookups.push(id())
    return { displayName: friendName, isResolved: friendResolved }
  },
}))

const entry: InboxNotification = {
  id: 'n1',
  type: 'friend_requests',
  action: 'received',
  actorId: 'a',
  actorName: 'Jakob',
  tourId: null,
  tourName: null,
  ref: {},
  occurrences: 1,
  readAt: null,
  createdAt: new Date().toISOString(),
}

function mountItem(stale: 'answered' | null = null) {
  const wrapper = mount(InboxItem, { props: { entry, stale } })
  const item = wrapper.get('[data-testid="inbox-item"]')
  Object.defineProperty(item.element, 'offsetWidth', { value: 300 })
  return { wrapper, item }
}

describe('inboxItem', () => {
  it('should snap back without deleting on a partial swipe', async () => {
    const { wrapper, item } = mountItem()
    await item.trigger('pointerdown', { clientX: 300 })
    await item.trigger('pointermove', { clientX: 250 })
    await item.trigger('pointerup', { clientX: 250 })

    expect(wrapper.emitted('delete')).toBeUndefined()
    expect(item.attributes('style')).toBeUndefined()
  })

  it('should delete past the threshold and not count the drag as a tap', async () => {
    const { wrapper, item } = mountItem()
    await item.trigger('pointerdown', { clientX: 300 })
    await item.trigger('pointermove', { clientX: 150 })
    await item.trigger('pointerup', { clientX: 150 })
    await item.trigger('click')

    expect(wrapper.emitted('delete')).toHaveLength(1)
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('should let stale override unread: no dot, reason chip shown', () => {
    const { wrapper, item } = mountItem('answered')

    expect(wrapper.find('[data-testid="unread-dot"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="stale-chip"]').text()).toContain('inbox.stale.answered')
    expect(item.attributes('aria-label')).toContain('inbox.stale.answered')
  })

  it('should hold the summary line blank until the first friend\'s name settles, then render it once', async () => {
    friendName.value = null
    friendResolved.value = false
    const summary = { ...entry, type: 'availability', action: 'weekly', actorId: null, actorName: null, ref: { friend_ids: ['f1', 'f2'] } } as InboxNotification
    const wrapper = mount(InboxItem, { props: { entry: summary, stale: null } })
    expect(friend.lookups.at(-1)).toBe('f1')
    expect(wrapper.get('.text').text()).toBe('')

    friendName.value = 'Anna'
    friendResolved.value = true
    await nextTick()
    expect(wrapper.get('.text').text()).toBe('inbox.entry.weeklyMore')
    expect(wrapper.find('[data-testid="stale-chip"]').exists()).toBe(false)
  })
})
