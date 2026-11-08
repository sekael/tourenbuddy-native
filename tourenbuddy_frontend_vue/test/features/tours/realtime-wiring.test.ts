import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

// ── shared hoisted mocks ────────────────────────────────────────────────────

const { mockUseRealtime, mockUseBroadcast, mockToursRepo, mockAttachmentsRepo, mockCurrentUser } = vi.hoisted(() => ({
  mockUseRealtime: vi.fn(),
  mockUseBroadcast: vi.fn(),
  mockToursRepo: {
    listToursForUser: vi.fn().mockResolvedValue([]),
    listFriendTours: vi.fn().mockResolvedValue([]),
    createTourWithPartners: vi.fn(),
    updateTour: vi.fn(),
    patchGpxFilepath: vi.fn(),
    patchCompleted: vi.fn(),
    deleteTour: vi.fn(),
  },
  mockAttachmentsRepo: {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
    getViewUrl: vi.fn(),
    getDownloadUrl: vi.fn(),
  },
  mockCurrentUser: { value: null as { id: string } | null },
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: mockUseRealtime,
}))

vi.mock('@/core/realtime/use-realtime-broadcast', () => ({
  useRealtimeBroadcast: mockUseBroadcast,
}))

vi.mock('@/features/tours/data/repositories/tours-repository-impl', () => ({
  ToursRepositoryImpl: vi.fn().mockImplementation(() => mockToursRepo),
}))

vi.mock('@/features/tours/data/services/gpx-storage-service', () => ({
  uploadGpx: vi.fn(),
  removeGpx: vi.fn(),
}))

vi.mock('@/features/tours/data/repositories/tour-attachment-repository-impl', () => ({
  SupabaseTourAttachmentRepository: vi.fn().mockImplementation(() => mockAttachmentsRepo),
}))

// Mock the whole contacts-store so it doesn't register its own
// useRealtimeSubscription call and shift the mock.calls indices.
vi.mock('@/features/contacts/presentation/stores/contacts-store', () => ({
  useContactsStore: vi.fn().mockReturnValue({
    $onAction: vi.fn().mockReturnValue(vi.fn()),
    contacts: { value: [] },
  }),
}))

// reactive proxy so Vue's watch tracks friendUserIds reads and fires on Set changes.
const mockFriendUserIds = ref(new Set<string>())
// Capture the $onAction subscriber so tests can simulate accept/removeFriendship.
const friendshipsActionCb = { value: null as null | ((ctx: { name: string, after: (cb: () => void) => void }) => void) }
vi.mock('@/features/friendships/presentation/stores/friendships-store', () => ({
  useFriendshipsStore: vi.fn(() => reactive({
    get friendUserIds() { return mockFriendUserIds.value },
    $onAction: (cb: (ctx: { name: string, after: (cb: () => void) => void }) => void) => {
      friendshipsActionCb.value = cb
      return vi.fn()
    },
  })),
}))

vi.mock('@/core/utils/phone-normalize', () => ({
  normalizePhone: vi.fn().mockReturnValue({ ok: false }),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    get currentUser() { return mockCurrentUser.value },
    get isAuthenticated() { return mockCurrentUser.value != null },
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

// ── tours-store realtime wiring ─────────────────────────────────────────────

describe('toursStore — realtime wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUseRealtime.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
    mockUseBroadcast.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
    mockFriendUserIds.value = new Set()
  })

  it('should pass null channel key when user is not authenticated', async () => {
    mockCurrentUser.value = null
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBeNull()
  })

  it('should pass channel key tours-<uid> when authenticated', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBe('tours-user-abc')
  })

  it('should pass enabled=false when not authenticated', async () => {
    mockCurrentUser.value = null
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.enabled()).toBe(false)
  })

  it('should wire two bindings: tours and tour_partners, both filtered by user_id', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    const bindings = opts.bindings()
    expect(bindings).toHaveLength(2)
    expect(bindings[0]).toMatchObject({ event: '*', table: 'tours', filter: 'user_id=eq.user-abc' })
    expect(bindings[1]).toMatchObject({ event: '*', table: 'tour_partners', filter: 'user_id=eq.user-abc' })
  })

  it('tour_partners event triggers loadTours via shared onChange', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    // Both bindings share one channel with one onChange — call it directly
    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()
    await Promise.resolve()

    expect(mockToursRepo.listToursForUser).toHaveBeenCalledTimes(1)
  })

  it('onChange calls loadTours (primitive handles debounce internally)', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()
    await Promise.resolve()

    expect(mockToursRepo.listToursForUser).toHaveBeenCalledTimes(1)
  })

  it('should not dispatch notifications from onChange', async () => {
    vi.useFakeTimers()
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    // Simply confirming onChange + timer doesn't throw / call any notify fn.
    // No notify imports exist in tours-store; this test guards against regressions.
    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()
    vi.advanceTimersByTime(200)
    vi.useRealTimers()
  })
})

// ── tour-attachments-store realtime wiring ──────────────────────────────────

describe('tourAttachmentsStore — realtime wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUseRealtime.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
    mockUseBroadcast.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
    mockAttachmentsRepo.list.mockResolvedValue([])
  })

  it('should pass null channel key when user is not authenticated', async () => {
    mockCurrentUser.value = null
    const { useTourAttachmentsStore } = await import(
      '@/features/tours/presentation/stores/tour-attachments-store'
    )
    useTourAttachmentsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBeNull()
  })

  it('should pass channel key tour-attachments-<uid> when authenticated', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useTourAttachmentsStore } = await import(
      '@/features/tours/presentation/stores/tour-attachments-store'
    )
    useTourAttachmentsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBe('tour-attachments-user-abc')
  })

  it('should wire user-scoped bindings on tour_attachments AND tour_suggestion', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useTourAttachmentsStore } = await import(
      '@/features/tours/presentation/stores/tour-attachments-store'
    )
    useTourAttachmentsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    const bindings = opts.bindings()
    expect(bindings).toContainEqual({
      event: '*',
      table: 'tour_attachments',
      filter: 'user_id=eq.user-abc',
    })
    // An accepted attachment suggestion inserts the row under the OWNER's user_id, so the
    // suggester's own filter above never fires — their suggestion row flipping status is
    // the only user-scoped event they get for it.
    expect(bindings).toContainEqual({
      event: 'UPDATE',
      table: 'tour_suggestion',
      filter: 'suggester_id=eq.user-abc',
    })
    // Never an unfiltered binding (architecture rule).
    expect(bindings.every((b: { filter?: string }) => b.filter?.includes('user-abc'))).toBe(true)
  })

  it('onChange short-circuits when no tour is currently loaded', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useTourAttachmentsStore } = await import(
      '@/features/tours/presentation/stores/tour-attachments-store'
    )
    const store = useTourAttachmentsStore()

    // currentTourId is null — no load() called yet
    expect(store.currentTourId).toBeNull()
    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()

    expect(mockAttachmentsRepo.list).not.toHaveBeenCalled()
  })

  it('onSubscribed refetches the open tour — a hidden tab drops inserts', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useTourAttachmentsStore } = await import(
      '@/features/tours/presentation/stores/tour-attachments-store'
    )
    const store = useTourAttachmentsStore()

    await store.load('tour-xyz')
    mockAttachmentsRepo.list.mockClear()

    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onSubscribed()
    await Promise.resolve()

    expect(mockAttachmentsRepo.list).toHaveBeenCalledWith('tour-xyz')
  })

  it('onChange calls load(currentTourId) when a tour is loaded', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useTourAttachmentsStore } = await import(
      '@/features/tours/presentation/stores/tour-attachments-store'
    )
    const store = useTourAttachmentsStore()

    await store.load('tour-xyz')
    mockAttachmentsRepo.list.mockClear()

    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()
    await Promise.resolve() // flush async load microtask

    expect(mockAttachmentsRepo.list).toHaveBeenCalledWith('tour-xyz')
  })
})

// ── tours-store broadcast wiring (#198) ─────────────────────────────────────

describe('toursStore — broadcast wiring (friend-tours)', () => {
  let activePinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    // Stop the previous pinia's effect scope to prevent watcher accumulation
    // across tests sharing the reactive mockFriendUserIds ref.
    // @ts-expect-error _e is internal
    activePinia?._e.stop()
    activePinia = createPinia()
    setActivePinia(activePinia)
    vi.clearAllMocks()
    mockUseRealtime.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
    mockUseBroadcast.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
    mockToursRepo.listFriendTours = vi.fn().mockResolvedValue([])
    mockFriendUserIds.value = new Set()
  })

  it('should pass topic friend-tours:<uid> when authenticated', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    const opts = mockUseBroadcast.mock.calls[0][0]
    expect(opts.topic()).toBe('friend-tours:user-abc')
    expect(opts.event).toBe('refetch')
  })

  it('should pass null topic when not authenticated', async () => {
    mockCurrentUser.value = null
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()

    const opts = mockUseBroadcast.mock.calls[0][0]
    expect(opts.topic()).toBeNull()
    expect(opts.enabled()).toBe(false)
  })

  it('onMessage triggers loadFriendTours', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()
    await nextTick()
    mockToursRepo.listFriendTours.mockClear()

    const opts = mockUseBroadcast.mock.calls[0][0]
    opts.onMessage()
    await Promise.resolve()

    expect(mockToursRepo.listFriendTours).toHaveBeenCalledTimes(1)
  })

  it('onSubscribed triggers loadFriendTours', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()
    await nextTick()
    mockToursRepo.listFriendTours.mockClear()

    const opts = mockUseBroadcast.mock.calls[0][0]
    opts.onSubscribed()
    await Promise.resolve()

    expect(mockToursRepo.listFriendTours).toHaveBeenCalledTimes(1)
  })

  it('onMessage only triggers loadFriendTours (no notifications side-effect)', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()
    await nextTick()
    mockToursRepo.listFriendTours.mockClear()

    const opts = mockUseBroadcast.mock.calls[0][0]
    opts.onMessage()
    await Promise.resolve()

    // Only listFriendTours called — no own-tour load, no notification dispatch
    expect(mockToursRepo.listFriendTours).toHaveBeenCalledTimes(1)
    expect(mockToursRepo.listToursForUser).not.toHaveBeenCalled()
  })

  it('friendUserIds change triggers loadFriendTours', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()
    await nextTick()

    // Count calls BEFORE the change (includes init calls from this + any lingering watchers)
    const before = mockToursRepo.listFriendTours.mock.calls.length
    mockFriendUserIds.value = new Set(['friend-1'])
    await nextTick()
    await Promise.resolve()

    // At least one new call must have been made by the friendUserIds watch
    expect(mockToursRepo.listFriendTours.mock.calls.length).toBeGreaterThan(before)
  })

  it('accept action (post-commit after) triggers loadFriendTours', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()
    await nextTick()
    mockToursRepo.listFriendTours.mockClear()

    // Simulate friendships-store accept resolving (after runs post-commit)
    friendshipsActionCb.value!({ name: 'accept', after: fn => fn() })
    await Promise.resolve()

    expect(mockToursRepo.listFriendTours).toHaveBeenCalledTimes(1)
  })

  it('unrelated friendships action does not refetch friend tours', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    useToursStore()
    await nextTick()
    mockToursRepo.listFriendTours.mockClear()

    friendshipsActionCb.value!({ name: 'sendRequest', after: fn => fn() })
    await Promise.resolve()

    expect(mockToursRepo.listFriendTours).not.toHaveBeenCalled()
  })

  it('stale (earlier-initiated) refetch does not overwrite a later one', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useToursStore } = await import(
      '@/features/tours/presentation/stores/tours-store'
    )
    const store = useToursStore()
    await nextTick()

    let resolveFirst!: (v: unknown) => void
    let resolveSecond!: (v: unknown) => void
    mockToursRepo.listFriendTours
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

    const p1 = store.loadFriendTours()
    const p2 = store.loadFriendTours()

    // Later-initiated call resolves first with fresh data; stale call resolves last.
    resolveSecond([{ id: 'fresh', tourTypes: [] }])
    await p2
    resolveFirst([])
    await p1

    expect(store.friendTours).toEqual([{ id: 'fresh', tourTypes: [] }])
  })
})
