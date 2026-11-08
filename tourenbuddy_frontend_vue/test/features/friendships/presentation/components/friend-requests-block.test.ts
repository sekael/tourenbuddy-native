import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import FriendRequestsSheet from '@/features/friendships/presentation/components/friend-requests-sheet.vue'
import { makeRequest } from '../../_helpers'

const mockSnackbarShow = vi.fn()

vi.mock('@/core/composables/use-snackbar', () => ({
  useSnackbar: () => ({ show: mockSnackbarShow }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ currentUser: { id: 'user-me' }, isAuthenticated: true }),
}))
vi.mock('@/features/friendships/data/repositories/friendship-repository-impl', () => ({
  FriendshipRepositoryImpl: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('@/features/friendships/data/repositories/user-block-repository-impl', () => ({
  UserBlockRepositoryImpl: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('@/core/components/adaptive-overlay.vue', () => ({
  default: { name: 'AdaptiveOverlay', props: ['title'], template: '<div><slot /></div>' },
}))
vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() }),
}))
function mountSheet(incoming = [makeRequest()]) {
  return mount(FriendRequestsSheet, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: true,
          initialState: {
            friendships: {
              incomingRequests: incoming,
              outgoingRequests: [],
              isLoading: false,
              userIdToPhoneMap: new Map(),
              userIdToNamesMap: new Map(),
            },
            contacts: { contacts: [] },
            userBlocks: { blocks: [], loading: false, error: null },
          },
        }),
      ],
    },
  })
}

describe('friend-requests-sheet — block entry point', () => {
  it('renders a Block button per incoming request row', async () => {
    const w = mountSheet()
    await nextTick()
    const blockBtns = w.findAll('[data-testid="req-block"]')
    expect(blockBtns.length).toBeGreaterThan(0)
  })

  it('opens block-confirm-dialog when Block button is clicked', async () => {
    const w = mountSheet()
    await nextTick()
    const blockBtn = w.find('[data-testid="req-block"]')
    await blockBtn.trigger('click')
    await nextTick()
    expect(w.findComponent({ name: 'BlockConfirmDialog' }).exists()).toBe(true)
  })

  it('closes dialog on cancel', async () => {
    const w = mountSheet()
    await nextTick()
    await w.find('[data-testid="req-block"]').trigger('click')
    await nextTick()
    const dialog = w.findComponent({ name: 'BlockConfirmDialog' })
    await dialog.vm.$emit('cancel')
    await nextTick()
    expect(w.findComponent({ name: 'BlockConfirmDialog' }).exists()).toBe(false)
  })

  it('has Blocked tab button', () => {
    const w = mountSheet()
    const tabs = w.findAll('.tab-btn')
    const labels = tabs.map(t => t.text())
    expect(labels).toContain('blocks.tabLabel')
  })

  it('switches to BlockedList when Blocked tab clicked', async () => {
    const w = mountSheet()
    const tabs = w.findAll('.tab-btn')
    const blockedTab = tabs.find(t => t.text() === 'blocks.tabLabel')
    await blockedTab!.trigger('click')
    await nextTick()
    expect(w.findComponent({ name: 'BlockedList' }).exists()).toBe(true)
  })
})
