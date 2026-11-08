import type {
  FriendRequest,
  Friendship,
} from '@/features/friendships/data/models/friendship-schemas'
import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ContactsListSheet from '@/features/contacts/presentation/components/contacts-list-sheet.vue'
import { makeFriendship, makeRequest } from '../../../friendships/_helpers'

const {
  mockCurrentUser,
  mockFindUserByPhone,
  mockFindUsersByPhones,
  mockListFriendships,
  mockListIncoming,
  mockPickContacts,
} = vi.hoisted(() => ({
  mockCurrentUser: {
    value: { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' } as {
      id: string
      phone_confirmed_at: string | null
    } | null,
  },
  mockFindUserByPhone: vi.fn<(phone: string) => Promise<string | null>>(),
  mockFindUsersByPhones: vi.fn<(phones: string[]) => Promise<{ phone: string, userId: string }[]>>(),
  mockListFriendships: vi.fn<() => Promise<Friendship[]>>(),
  mockListIncoming: vi.fn<() => Promise<FriendRequest[]>>(),
  mockPickContacts: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))
vi.mock('@/features/contacts/presentation/composables/use-contact-picker', () => ({
  useContactPicker: () => ({ isSupported: true, pickContacts: mockPickContacts }),
}))
vi.mock('@/features/contacts/presentation/composables/use-vcard-import', () => ({
  useVCardImport: () => ({ parseVCardFile: vi.fn() }),
}))
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn(() => ({
    get currentUser() {
      return mockCurrentUser.value
    },
    get isAuthenticated() {
      return mockCurrentUser.value != null
    },
  })),
}))
vi.mock('@/features/friendships/data/repositories/friendship-repository-impl', () => ({
  FriendshipRepositoryImpl: vi.fn(() => ({
    sendRequest: vi.fn(),
    accept: vi.fn(),
    deny: vi.fn(),
    cancel: vi.fn(),
    listIncoming: mockListIncoming,
    listFriendships: mockListFriendships,
    findUserByPhone: mockFindUserByPhone,
    findUsersByPhones: mockFindUsersByPhones,
  })),
}))
vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockImplementation((opts: { onSubscribed?: () => void }) => {
    opts.onSubscribed?.()
    return { status: { value: 'SUBSCRIBED' }, stop: vi.fn() }
  }),
}))

vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn(() => ({
    fetchContacts: vi.fn().mockResolvedValue([]),
    createContactFull: vi.fn().mockImplementation(async (c: unknown) => c),
    updateContactFull: vi.fn().mockImplementation(async (c: unknown) => c),
    getContactUpdatedAt: vi.fn().mockResolvedValue(null),
    deleteContact: vi.fn(),
  })),
}))

const PHONE = '+41791234567'

const anna = {
  id: 'c-1',
  userId: 'user-me',
  firstName: 'Anna',
  lastName: 'Meier',
  displayName: null,
  contactMethods: [
    {
      id: 'm-1',
      contactId: 'c-1',
      methodType: 'phone',
      value: PHONE,
      label: null,
      isPrimary: true,
    },
  ],
}

const ContactFormStub = {
  name: 'ContactForm',
  template: '<div data-testid="contact-form" />',
  emits: ['submit', 'cancel', 'phone-change'],
  props: ['submitLabel', 'isLoading'],
}

const ConnectPromptStub = {
  name: 'ConnectPrompt',
  template: '<div data-testid="connect-prompt" :data-user-id="matchedUserId" />',
  emits: ['sent', 'dismissed'],
  props: ['matchedUserId'],
}

function mountSheet(contacts: (typeof anna)[] = [anna]) {
  return mount(ContactsListSheet, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: { contacts: { contacts, isLoading: false, error: null } },
        }),
      ],
      stubs: {
        ContactDetailView: { template: '<div />', emits: ['back', 'deleted'], props: ['contact'] },
        ContactForm: ContactFormStub,
        ConnectPrompt: ConnectPromptStub,
      },
    },
  })
}

async function openAddView(wrapper: ReturnType<typeof mountSheet>) {
  await wrapper.find('[data-testid="add-contact-btn"]').trigger('click')
  await wrapper.vm.$nextTick()
}

function resetMocks() {
  vi.clearAllMocks()
  mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' }
  mockListIncoming.mockResolvedValue([])
  mockListFriendships.mockResolvedValue([])
  mockFindUsersByPhones.mockResolvedValue([])
}

// ── connect-prompt suppression ───────────────────────────────────────────────

describe('connect-prompt suppression (no-prompt rules)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not run lookup when caller phone is unverified', async () => {
    mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: null }
    mockFindUserByPhone.mockResolvedValue('user-other')

    const wrapper = mountSheet()
    await flushPromises()
    await openAddView(wrapper)
    await wrapper.findComponent(ContactFormStub).vm.$emit('phone-change', PHONE)
    vi.advanceTimersByTime(400)
    await flushPromises()

    expect(mockFindUserByPhone).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="connect-prompt"]').exists()).toBe(false)
  })

  it('suppresses prompt when matched user is already a friend', async () => {
    mockListFriendships.mockResolvedValue([makeFriendship('user-me', 'user-other')])
    mockFindUserByPhone.mockResolvedValue('user-other')

    const wrapper = mountSheet()
    await flushPromises()
    await openAddView(wrapper)
    await wrapper.findComponent(ContactFormStub).vm.$emit('phone-change', PHONE)
    vi.advanceTimersByTime(400)
    await flushPromises()

    expect(wrapper.find('[data-testid="connect-prompt"]').exists()).toBe(false)
  })

  it('suppresses prompt when a pending outgoing request exists', async () => {
    mockListIncoming.mockResolvedValue([
      makeRequest({ id: 'r1', fromUserId: 'user-me', toUserId: 'user-other' }),
    ])
    mockFindUserByPhone.mockResolvedValue('user-other')

    const wrapper = mountSheet()
    await flushPromises()
    await openAddView(wrapper)
    await wrapper.findComponent(ContactFormStub).vm.$emit('phone-change', PHONE)
    vi.advanceTimersByTime(400)
    await flushPromises()

    expect(wrapper.find('[data-testid="connect-prompt"]').exists()).toBe(false)
  })
})

// ── friend icon negative cases ───────────────────────────────────────────────

describe('friend icon — negative cases', () => {
  beforeEach(resetMocks)

  it('hides friend icon when no phone matches any friendship', async () => {
    const wrapper = mountSheet()
    await flushPromises()
    expect(wrapper.find('.friend-icon').exists()).toBe(false)
  })

  it('hides friend icon when only a pending request exists (not yet accepted)', async () => {
    mockListIncoming.mockResolvedValue([
      makeRequest({ id: 'r1', fromUserId: 'user-me', toUserId: 'user-other' }),
    ])
    mockFindUsersByPhones.mockResolvedValue([{ phone: PHONE, userId: 'user-other' }])

    const wrapper = mountSheet()
    await flushPromises()
    expect(wrapper.find('.friend-icon').exists()).toBe(false)
  })
})

// ── import discovery edges ───────────────────────────────────────────────────

describe('import discovery (failure + gating)', () => {
  const PHONE_A = '+41791111111'
  const PHONE_B = '+41792222222'
  const importedItems = [
    {
      firstName: 'A',
      lastName: '',
      phones: [{ value: PHONE_A, label: null, isPrimary: true }],
      rawPhoneNumbers: [],
    },
    {
      firstName: 'B',
      lastName: '',
      phones: [{ value: PHONE_B, label: null, isPrimary: true }],
      rawPhoneNumbers: [],
    },
  ]
  const pickerBtn = (w: ReturnType<typeof mountSheet>) => w.find('[data-testid="import-picker-btn"]')

  beforeEach(() => {
    resetMocks()
    mockPickContacts.mockResolvedValue(importedItems)
  })

  it('still shows import results when batch lookup throws (store swallows error)', async () => {
    mockFindUsersByPhones.mockRejectedValue(new Error('RPC error'))

    const wrapper = mountSheet([])
    await flushPromises()
    await openAddView(wrapper)
    await pickerBtn(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.find('.results-view').exists()).toBe(true)
    expect(wrapper.find('[data-testid="connect-prompt"]').exists()).toBe(false)
  })

  it('skips batch discovery when caller phone unverified', async () => {
    mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: null }

    const wrapper = mountSheet([])
    await flushPromises()
    await openAddView(wrapper)
    await pickerBtn(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.find('.results-view').exists()).toBe(true)
    const importBatch = mockFindUsersByPhones.mock.calls.find(
      c => c[0].includes(PHONE_A) && c[0].includes(PHONE_B),
    )
    expect(importBatch).toBeUndefined()
  })
})
