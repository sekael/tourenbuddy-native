import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'
import { useFriendDisplayName } from '@/features/friendships/presentation/composables/use-friend-display-name'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'

// The settle gate: the name must be written once, in final form. Every case here is a
// window in which the OLD behaviour would have shown "a friend" and then swapped it.

// The composable kicks a contacts load when no host page has (so the gate always
// settles); leave that fetch pending so it never clobbers the seeded contacts.
vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn().mockImplementation(() => ({
    fetchContacts: () => new Promise(() => {}),
  })),
}))

const PHONE = '+41791111111'

function contact(id: string, firstName: string, phone = PHONE) {
  return {
    id,
    firstName,
    lastName: null,
    displayName: null,
    contactMethods: [{ id: `m-${id}`, methodType: 'phone', value: phone, isPrimary: true }],
  } as any
}

/** Mounts the composable in a host so `watch` runs, exposing its refs + the stores. */
function mountComposable(userId = ref<string | null>('user-a')) {
  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
  let api: ReturnType<typeof useFriendDisplayName>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useFriendDisplayName(userId)
        return () => h('span', api.isResolved.value ? (api.displayName.value ?? '') : 'SKELETON')
      },
    }),
    { global: { plugins: [pinia] } },
  )
  return { wrapper, api: api!, userId, contactsStore: useContactsStore(), friendshipsStore: useFriendshipsStore() }
}

describe('useFriendDisplayName (gate + failure paths)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('never emits the fallback while contacts are still loading', async () => {
    const { wrapper, api, contactsStore, friendshipsStore } = mountComposable()
    friendshipsStore.userIdToPhoneMap = new Map([['user-a', PHONE]])

    // Phone settled, contacts have NOT loaded yet — the cold-start window where
    // `!isLoading` would have read "settled, no contact" and shown the fallback.
    await vi.waitFor(() => expect(wrapper.text()).toBe('SKELETON'))
    expect(api.isResolved.value).toBe(false)

    contactsStore.contacts = [contact('c1', 'Mum')]
    contactsStore.hasLoaded = true

    await vi.waitFor(() => expect(wrapper.text()).toBe('Mum'))
  })

  it('treats an empty contact name as unresolved rather than rendering blank', async () => {
    const { wrapper, contactsStore, friendshipsStore } = mountComposable()
    friendshipsStore.userIdToPhoneMap = new Map([['user-a', PHONE]])
    contactsStore.contacts = [contact('c1', '   ')]
    contactsStore.hasLoaded = true

    await vi.waitFor(() => expect(wrapper.text()).toBe('tours.list.aFriend'))
  })

  it('settles to the fallback when the phone lookup fails (never shimmers forever)', async () => {
    const { wrapper, api, contactsStore, friendshipsStore } = mountComposable()
    friendshipsStore.ensurePhones = vi.fn().mockRejectedValue(new Error('offline'))
    contactsStore.hasLoaded = true

    await vi.waitFor(() => expect(api.isResolved.value).toBe(true))
    expect(wrapper.text()).toBe('tours.list.aFriend')
  })

  it('returns to unresolved when the id changes, so no previous name shows through', async () => {
    const userId = ref<string | null>('user-a')
    const { wrapper, contactsStore, friendshipsStore } = mountComposable(userId)
    friendshipsStore.userIdToPhoneMap = new Map([['user-a', PHONE]])
    contactsStore.contacts = [contact('c1', 'Mum')]
    contactsStore.hasLoaded = true
    await vi.waitFor(() => expect(wrapper.text()).toBe('Mum'))

    // Slow lookup for the next owner: the gate must close, not hold 'Mum'.
    friendshipsStore.ensurePhones = vi.fn().mockReturnValue(new Promise(() => {}))
    userId.value = 'user-b'
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toBe('SKELETON')
  })

  it('resolves a contact stored in local format against the E.164 lookup', async () => {
    const { wrapper, contactsStore, friendshipsStore } = mountComposable()
    friendshipsStore.userIdToPhoneMap = new Map([['user-a', '+41791111111']])
    contactsStore.contacts = [contact('c1', 'Mum', '079 111 11 11')]
    contactsStore.hasLoaded = true

    await vi.waitFor(() => expect(wrapper.text()).toBe('Mum'))
  })
})
