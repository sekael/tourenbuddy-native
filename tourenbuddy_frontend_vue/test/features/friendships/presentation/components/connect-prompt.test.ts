import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConnectPrompt from '@/features/friendships/presentation/components/connect-prompt.vue'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'
import { makeRequest } from '../../_helpers'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ currentUser: null, isAuthenticated: false }),
}))
vi.mock('@/features/friendships/data/repositories/user-block-repository-impl', () => ({
  UserBlockRepositoryImpl: vi.fn().mockImplementation(() => ({
    listActive: vi.fn().mockResolvedValue([]),
    isBlockedBy: vi.fn().mockResolvedValue(false),
    block: vi.fn(),
    unblock: vi.fn(),
    report: vi.fn(),
  })),
}))
vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() }),
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

function mountPrompt(opts: { beforeSend?: () => Promise<void>, beforeDismiss?: () => Promise<void>, showDismiss?: boolean } = {}) {
  return mount(ConnectPrompt, {
    props: { matchedUserId: 'user-42', ...opts },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })],
    },
  })
}

describe('connectPrompt', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('showDismiss prop', () => {
    it('should render dismiss button when showDismiss is omitted', () => {
      const wrapper = mountPrompt()
      expect(wrapper.find('.base-button--secondary').exists()).toBe(true)
    })

    it('should render dismiss button when showDismiss is true', () => {
      const wrapper = mountPrompt({ showDismiss: true })
      expect(wrapper.find('.base-button--secondary').exists()).toBe(true)
    })

    it('should NOT render dismiss button when showDismiss is false', () => {
      const wrapper = mountPrompt({ showDismiss: false })
      expect(wrapper.find('.base-button--secondary').exists()).toBe(false)
    })

    it('should still render send button when showDismiss is false', () => {
      const wrapper = mountPrompt({ showDismiss: false })
      expect(wrapper.find('.base-button--primary').exists()).toBe(true)
    })
  })

  describe('beforeSend hook', () => {
    it('should await beforeSend before calling sendRequest when hook resolves', async () => {
      const callOrder: string[] = []
      const beforeSend = vi.fn(async () => {
        callOrder.push('hook')
      })
      const wrapper = mountPrompt({ beforeSend })
      const store = useFriendshipsStore()
      vi.mocked(store.sendRequest).mockImplementation(async () => {
        callOrder.push('send')
        return null
      })

      await wrapper.find('.base-button--primary').trigger('click')
      await flushPromises()

      expect(callOrder).toEqual(['hook', 'send'])
      expect(store.sendRequest).toHaveBeenCalledWith('user-42')
    })

    it('should NOT call sendRequest when beforeSend rejects', async () => {
      const beforeSend = vi.fn().mockRejectedValue(new Error('Save failed'))
      const wrapper = mountPrompt({ beforeSend })
      const store = useFriendshipsStore()

      await wrapper.find('.base-button--primary').trigger('click')
      await flushPromises()

      expect(store.sendRequest).not.toHaveBeenCalled()
      expect(wrapper.find('.error-text').text()).toBe('friendships.sendFailedRetry')
    })

    it('should leave buttons interactive after beforeSend rejects for retry', async () => {
      const beforeSend = vi.fn().mockRejectedValue(new Error('oops'))
      const wrapper = mountPrompt({ beforeSend })

      await wrapper.find('.base-button--primary').trigger('click')
      await flushPromises()

      const sendBtn = wrapper.find('.base-button--primary')
      const dismissBtn = wrapper.find('.base-button--secondary')
      expect((sendBtn.element as HTMLButtonElement).disabled).toBe(false)
      expect((dismissBtn.element as HTMLButtonElement).disabled).toBe(false)
    })

    it('should call sendRequest directly when no beforeSend prop is provided', async () => {
      const wrapper = mountPrompt()
      const store = useFriendshipsStore()
      vi.mocked(store.sendRequest).mockResolvedValue(undefined as never)

      await wrapper.find('.base-button--primary').trigger('click')
      await flushPromises()

      expect(store.sendRequest).toHaveBeenCalledWith('user-42')
    })
  })

  describe('error surfacing', () => {
    it('should show sendRequest error message when request fails', async () => {
      const wrapper = mountPrompt()
      const store = useFriendshipsStore()
      vi.mocked(store.sendRequest).mockRejectedValue(new Error('network error'))

      await wrapper.find('.base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('.error-text').text()).toBe('friendships.sendFailedRetry')
    })
  })

  describe('accept variant (incoming pending request)', () => {
    // Build the prompt with incomingRequestFrom pre-mocked so the accept-mode
    // computed evaluates to an id on first render.
    function mountAcceptPrompt(acceptImpl?: () => Promise<void>) {
      const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
      setActivePinia(pinia)
      const store = useFriendshipsStore()
      vi.mocked(store.incomingRequestFrom).mockReturnValue(
        makeRequest({ id: 'req-x', fromUserId: 'user-42', toUserId: 'user-me' }),
      )
      if (acceptImpl)
        vi.mocked(store.accept).mockImplementation(acceptImpl)
      const wrapper = mount(ConnectPrompt, {
        props: { matchedUserId: 'user-42' },
        global: { plugins: [pinia] },
      })
      return { wrapper, store }
    }

    it('should call store.accept with the incoming request id and show the now-friends panel', async () => {
      const { wrapper, store } = mountAcceptPrompt(async () => {})

      await wrapper.find('.base-button--primary').trigger('click')
      await flushPromises()

      expect(store.accept).toHaveBeenCalledWith('req-x')
      expect(store.sendRequest).not.toHaveBeenCalled()
      expect(wrapper.find('.sent-msg').text()).toContain('friendships.nowFriends')
      expect(wrapper.emitted('sent')).toHaveLength(1)
    })

    it('should leave an actionable error state when accept fails', async () => {
      const { wrapper } = mountAcceptPrompt(() => Promise.reject(new Error('boom')))

      await wrapper.find('.base-button--primary').trigger('click')
      await flushPromises()

      expect(wrapper.find('.error-text').text()).toBe('friendships.sendFailedRetry')
      expect((wrapper.find('.base-button--primary').element as HTMLButtonElement).disabled).toBe(false)
    })
  })

  describe('beforeDismiss hook', () => {
    it('should await beforeDismiss before emitting dismissed when hook resolves', async () => {
      const beforeDismiss = vi.fn().mockResolvedValue(undefined)
      const wrapper = mountPrompt({ beforeDismiss })

      await wrapper.find('.base-button--secondary').trigger('click')
      await flushPromises()

      expect(beforeDismiss).toHaveBeenCalled()
      expect(wrapper.emitted('dismissed')).toHaveLength(1)
    })

    it('should NOT emit dismissed when beforeDismiss rejects', async () => {
      const beforeDismiss = vi.fn().mockRejectedValue(new Error('save failed'))
      const wrapper = mountPrompt({ beforeDismiss })

      await wrapper.find('.base-button--secondary').trigger('click')
      await flushPromises()

      expect(wrapper.emitted('dismissed')).toBeFalsy()
      expect(wrapper.find('.error-text').text()).toBe('save failed')
    })

    it('should emit dismissed immediately when no beforeDismiss prop provided', async () => {
      const wrapper = mountPrompt()

      await wrapper.find('.base-button--secondary').trigger('click')

      expect(wrapper.emitted('dismissed')).toHaveLength(1)
    })
  })
})
