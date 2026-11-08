import type { UserBlock } from '@/features/friendships/data/models/user-block-schemas'
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlockedList from '@/features/friendships/presentation/components/blocked-list.vue'

const mockSnackbarShow = vi.fn()

vi.mock('@/core/composables/use-snackbar', () => ({
  useSnackbar: () => ({ show: mockSnackbarShow }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))
vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ currentUser: { id: 'user-me' }, isAuthenticated: true }),
}))
vi.mock('@/features/friendships/data/repositories/user-block-repository-impl', () => ({
  UserBlockRepositoryImpl: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('@/features/friendships/data/repositories/friendship-repository-impl', () => ({
  FriendshipRepositoryImpl: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() }),
}))
function makeBlock(overrides: Partial<UserBlock> = {}): UserBlock {
  return {
    blockerUserId: 'user-me',
    blockedUserId: 'user-b',
    firstBlockedAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    lastBlockedAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    unblockedAt: null,
    ...overrides,
  }
}

function mountList(blocks: UserBlock[] = []) {
  return mount(BlockedList, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: true,
          initialState: {
            userBlocks: { blocks, loading: false, error: null },
            friendships: { userIdToPhoneMap: new Map(), userIdToNamesMap: new Map() },
          },
        }),
      ],
    },
  })
}

describe('blocked-list', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows empty state when no active blocks', () => {
    const w = mountList([])
    expect(w.text()).toContain('blocks.emptyState')
  })

  it('renders active block rows', () => {
    const block = makeBlock()
    const w = mountList([block])
    expect(w.find('.block-items').exists()).toBe(true)
    expect(w.find('.block-user').exists()).toBe(true)
  })

  it('unblock button enabled when cooldown has elapsed', () => {
    const block = makeBlock()
    const w = mountList([block])
    const btn = w.find('.base-button--secondary')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('unblock button disabled when within cooldown', () => {
    const block = makeBlock({ lastBlockedAt: new Date().toISOString() })
    const w = mountList([block])
    const btn = w.find('.base-button--secondary')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows cooldown remaining hours when within cooldown', () => {
    const block = makeBlock({ lastBlockedAt: new Date(Date.now() - 3600 * 1000).toISOString() })
    const w = mountList([block])
    expect(w.text()).toContain('blocks.cooldown.remaining')
  })
})
