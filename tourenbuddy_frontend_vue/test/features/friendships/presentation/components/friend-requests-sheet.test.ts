import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'
import FriendRequestsSheet from '@/features/friendships/presentation/components/friend-requests-sheet.vue'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'
import { makeRequest } from '../../_helpers'

const mockSnackbarShow = vi.fn()

vi.mock('@/core/composables/use-snackbar', () => ({
  useSnackbar: () => ({ show: mockSnackbarShow }),
}))
// Mobile: the sheet's stacked tab panels only apply below the desktop breakpoint.
vi.mock('@/core/composables/use-is-desktop', () => ({ useIsDesktop: () => false }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ currentUser: null, isAuthenticated: false }),
}))
vi.mock('@/features/friendships/data/repositories/friendship-repository-impl', () => ({
  FriendshipRepositoryImpl: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('@/core/components/adaptive-overlay.vue', () => ({
  default: { name: 'AdaptiveOverlay', props: ['title'], template: '<div><slot /></div>' },
}))

interface MountOpts {
  incoming?: ReturnType<typeof makeRequest>[]
  outgoing?: ReturnType<typeof makeRequest>[]
  isLoading?: boolean
  userIdToPhoneMap?: Map<string, string>
  userIdToNamesMap?: Map<string, { firstName: string | null, lastName: string | null }>
  contacts?: Array<{ id: string, firstName?: string, lastName?: string, contactMethods: Array<{ methodType: string, value: string }> }>
}

function mountSheet(opts: MountOpts = {}) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: true,
    initialState: {
      friendships: {
        incomingRequests: opts.incoming ?? [],
        outgoingRequests: opts.outgoing ?? [],
        friendships: [],
        isLoading: opts.isLoading ?? false,
        error: null,
        userIdToPhoneMap: opts.userIdToPhoneMap ?? new Map(),
        userIdToNamesMap: opts.userIdToNamesMap ?? new Map(),
      },
      contacts: { contacts: opts.contacts ?? [], isLoading: false, error: null },
    },
  })
  // stubActions replaces findContactByMethodValue with a no-op; the component now
  // delegates its "contact already exists?" check (and outgoing name resolution) to
  // it, so back it with a real lookup over the provided contacts. Wire it BEFORE
  // mount — displayNameFor runs during the initial render. Exact match: tests use
  // E.164 values (normalization is covered in the contacts-store unit test).
  const contacts = useContactsStore(pinia)
  vi.mocked(contacts.findContactByMethodValue).mockImplementation((type, value) =>
    (opts.contacts ?? []).find(c =>
      c.contactMethods.some(m => m.methodType === type && m.value === value),
    ) as ReturnType<typeof contacts.findContactByMethodValue>,
  )
  const wrapper = mount(FriendRequestsSheet, { global: { plugins: [pinia] } })
  return { wrapper, friendships: useFriendshipsStore(pinia), contacts }
}

async function triggerAccept(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('[data-testid="req-accept"]').trigger('click')
  await nextTick()
  await wrapper.find('[data-testid="req-accept"]').trigger('click')
}

describe('friendRequestsSheet (edges only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering edges', () => {
    it('hides action rows while loading', () => {
      const { wrapper } = mountSheet({ isLoading: true })
      expect(wrapper.find('[data-testid="req-accept"]').exists()).toBe(false)
    })

    it('shows empty state when no incoming requests', () => {
      const { wrapper } = mountSheet()
      expect(wrapper.text()).toContain('friendships.inboxEmpty')
    })

    it('shows confirm dialog after clicking accept', async () => {
      const { wrapper } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
      })
      await wrapper.find('[data-testid="req-accept"]').trigger('click')
      await nextTick()
      expect(wrapper.find('.confirm-content').exists()).toBe(true)
    })
  })

  describe('incoming row display name', () => {
    const PHONE = '+41791234567'

    it('renders phone-only when no profile name in map', () => {
      const { wrapper } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
        userIdToPhoneMap: new Map([['user-other', PHONE]]),
        userIdToNamesMap: new Map([['user-other', { firstName: null, lastName: null }]]),
      })
      expect(wrapper.find('.request-phone-sub').exists()).toBe(false)
      expect(wrapper.find('.request-user').text()).toContain('+41')
    })

    it('renders name primary and phone secondary when name resolved', () => {
      const { wrapper } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
        userIdToPhoneMap: new Map([['user-other', PHONE]]),
        userIdToNamesMap: new Map([['user-other', { firstName: 'Ada', lastName: 'Lovelace' }]]),
      })
      expect(wrapper.find('.request-user').text()).toBe('Ada Lovelace')
      expect(wrapper.find('.request-phone-sub').exists()).toBe(true)
    })
  })

  describe('outgoing row display name', () => {
    const PHONE = '+41791234567'

    it('renders phone-only when no local contact matches', () => {
      const { wrapper } = mountSheet({
        outgoing: [makeRequest({ id: 'req-2', fromUserId: 'user-me', toUserId: 'user-other' })],
        userIdToPhoneMap: new Map([['user-other', PHONE]]),
        contacts: [],
      })
      expect(wrapper.find('.request-phone-sub').exists()).toBe(false)
    })

    it('renders local contact name primary and phone secondary when match found', () => {
      const { wrapper } = mountSheet({
        outgoing: [makeRequest({ id: 'req-2', fromUserId: 'user-me', toUserId: 'user-other' })],
        userIdToPhoneMap: new Map([['user-other', PHONE]]),
        contacts: [{
          id: 'c-1',
          firstName: 'Bob',
          lastName: 'Stewart',
          contactMethods: [{ methodType: 'phone', value: PHONE }],
        }],
      })
      expect(wrapper.find('.request-user').text()).toBe('Bob Stewart')
      expect(wrapper.find('.request-phone-sub').exists()).toBe(true)
    })
  })

  describe('error handling shows snackbar', () => {
    it('accept failure surfaces snackbar instead of throwing', async () => {
      const { wrapper, friendships } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
      })
      vi.mocked(friendships.accept).mockRejectedValue(new Error('boom'))
      await triggerAccept(wrapper)
      await flushPromises()
      expect(mockSnackbarShow).toHaveBeenCalled()
    })

    it('deny failure surfaces snackbar', async () => {
      const { wrapper, friendships } = mountSheet({
        incoming: [makeRequest({ id: 'req-1' })],
      })
      vi.mocked(friendships.deny).mockRejectedValue(new Error('boom'))
      await wrapper.find('[data-testid="req-deny"]').trigger('click')
      await flushPromises()
      expect(mockSnackbarShow).toHaveBeenCalled()
    })

    it('cancel failure surfaces snackbar', async () => {
      const { wrapper, friendships } = mountSheet({
        outgoing: [makeRequest({ id: 'req-2', fromUserId: 'user-me', toUserId: 'user-other' })],
      })
      vi.mocked(friendships.cancel).mockRejectedValue(new Error('boom'))
      await wrapper.find('[data-testid="req-cancel"]').trigger('click')
      await flushPromises()
      expect(mockSnackbarShow).toHaveBeenCalled()
    })
  })

  describe('auto-create contact on accept', () => {
    const PHONE = '+41791234567'

    it('skips addContact when sender phone is not in map', async () => {
      const { wrapper, friendships, contacts } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
        userIdToPhoneMap: new Map(),
      })
      vi.mocked(friendships.accept).mockResolvedValue(undefined)
      await triggerAccept(wrapper)
      await flushPromises()
      expect(contacts.addContact).not.toHaveBeenCalled()
    })

    it('skips addContact when a contact already has the friend phone', async () => {
      const { wrapper, friendships, contacts } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
        userIdToPhoneMap: new Map([['user-other', PHONE]]),
        contacts: [{ id: 'c-1', contactMethods: [{ methodType: 'phone', value: PHONE }] }],
      })
      vi.mocked(friendships.accept).mockResolvedValue(undefined)
      await triggerAccept(wrapper)
      await flushPromises()
      expect(contacts.addContact).not.toHaveBeenCalled()
    })

    it('does not auto-create contact when accept fails', async () => {
      const { wrapper, friendships, contacts } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
        userIdToPhoneMap: new Map([['user-other', PHONE]]),
      })
      vi.mocked(friendships.accept).mockRejectedValue(new Error('rls'))
      await triggerAccept(wrapper)
      await flushPromises()
      expect(contacts.addContact).not.toHaveBeenCalled()
    })

    it('addContact called with profile name when RPC returns first name', async () => {
      const { wrapper, friendships, contacts } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
        userIdToPhoneMap: new Map([['user-other', PHONE]]),
        userIdToNamesMap: new Map([['user-other', { firstName: 'Ada', lastName: 'Lovelace' }]]),
      })
      vi.mocked(friendships.accept).mockResolvedValue(undefined)
      vi.mocked(friendships.getNamesByUserIds).mockResolvedValue(undefined)
      await triggerAccept(wrapper)
      await flushPromises()
      expect(contacts.addContact).toHaveBeenCalledWith('Ada', 'Lovelace', null, [{ value: PHONE, isPrimary: true }])
    })

    it('addContact falls back to formatted phone when profile first name is null', async () => {
      const { wrapper, friendships, contacts } = mountSheet({
        incoming: [makeRequest({ id: 'req-1', fromUserId: 'user-other', toUserId: 'user-me' })],
        userIdToPhoneMap: new Map([['user-other', PHONE]]),
        userIdToNamesMap: new Map([['user-other', { firstName: null, lastName: null }]]),
      })
      vi.mocked(friendships.accept).mockResolvedValue(undefined)
      vi.mocked(friendships.getNamesByUserIds).mockResolvedValue(undefined)
      await triggerAccept(wrapper)
      await flushPromises()
      expect(contacts.addContact).toHaveBeenCalledWith(
        expect.stringContaining('+41'),
        null,
        null,
        [{ value: PHONE, isPrimary: true }],
      )
    })
  })
})

describe('friendRequestsSheet — tab switch on mobile', () => {
  it('should keep both panels in one grid cell so switching tabs never resizes the sheet', async () => {
    const { wrapper } = mountSheet()
    const panels = () => wrapper.findAll('.tab-panel')
    expect(wrapper.find('.tab-panels--stacked').exists()).toBe(true)
    expect(panels()).toHaveLength(2)
    expect(panels()[1]!.attributes('inert')).toBeDefined()

    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    expect(panels()).toHaveLength(2)
    expect(panels()[0]!.classes()).toContain('tab-panel--hidden')
    expect(panels()[0]!.attributes('inert')).toBeDefined()
    expect(panels()[1]!.attributes('inert')).toBeUndefined()
  })
})
