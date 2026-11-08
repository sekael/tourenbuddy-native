import type { WriteQueueEntry } from '@/core/offline/write-queue'
import type { TourDraft } from '@/features/tours/domain/entities/tour'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/core/utils/supabase'
import { DRAFT_FILL } from '../../../../fixtures/tour-fill'
import 'fake-indexeddb/auto'

// Replay (10.3) + conflict/LWW (10.5) at the store's registered replay handler. Notifications
// are emitted by the DB inside the replayed RPC, so the client asserts only the write.
// The offline ENQUEUE is exercised for real (proving zero notifications offline); the
// REPLAY side is driven with hand-crafted queue entries via a mocked `peekAllOrdered`, so
// the handler's op-keyed dispatch + last-write-wins gate are asserted without depending on
// fake-indexeddb cloning Vue's reactive baseSnapshot proxy (real browsers clone it fine).

const {
  mockCreate,
  mockUpdate,
  mockGetUpdatedAt,
  peekAllOrdered,
  remove,
  deadLetter,
  bumpAttempt,
} = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue(undefined),
  mockUpdate: vi.fn().mockResolvedValue(true),
  mockGetUpdatedAt: vi.fn(),
  peekAllOrdered: vi.fn().mockResolvedValue([]),
  remove: vi.fn().mockResolvedValue(undefined),
  deadLetter: vi.fn().mockResolvedValue(undefined),
  bumpAttempt: vi.fn().mockResolvedValue(undefined),
}))

// Override only the drain-side queue ops; keep coalesce / assertQueueHeadroom real so the
// store's offline enqueue path still works against fake-indexeddb.
vi.mock('@/core/offline/write-queue', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/offline/write-queue')>()),
  peekAllOrdered,
  remove,
  deadLetter,
  bumpAttempt,
}))

vi.mock('@/features/tours/data/repositories/tours-repository-impl', () => ({
  ToursRepositoryImpl: vi.fn().mockImplementation(() => ({
    listToursForUser: vi.fn().mockResolvedValue([]),
    createTourWithPartners: mockCreate,
    updateTour: mockUpdate,
    deleteTour: vi.fn(),
    getUpdatedAt: mockGetUpdatedAt,
  })),
}))

vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn().mockImplementation(() => ({ fetchContacts: vi.fn().mockResolvedValue([]) })),
}))

vi.mock('@/features/tours/data/services/gpx-storage-service', () => ({
  uploadGpx: vi.fn(),
  removeGpx: vi.fn(),
  getSignedUrl: vi.fn(),
  downloadOriginal: vi.fn(),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({ currentUser: { id: 'user-1' }, isAuthenticated: true }),
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: () => ({ status: { value: 'idle' }, stop: vi.fn() }),
}))

const { isOnline } = await import('@/core/offline/use-online-status')
const { replayQueue } = await import('@/core/offline/replay')
const { useToursStore } = await import('@/features/tours/presentation/stores/tours-store')
const { removeGpx } = await import('@/features/tours/data/services/gpx-storage-service')
const removeGpxMock = vi.mocked(removeGpx)

function draft(over: Partial<TourDraft> = {}): TourDraft {
  return {
    ...DRAFT_FILL,
    name: 'Rigi',
    plannedDate: null,
    partnerIds: ['contact-1'],
    tourTypes: [],
    elevation: null,
    gpxFilepath: null,
    description: null,
    seasons: null,
    startPoint: null,
    endPoint: null,
    startPointName: null,
    startPointElevation: null,
    endPointName: null,
    endPointElevation: null,
    equipment: null,
    notes: null,
    ...over,
  }
}

const goal = { lng: 8.2, lat: 46.8 }

function entry(over: Partial<WriteQueueEntry>): WriteQueueEntry {
  return { entityId: 't1', kind: 'tour', op: 'create', payload: { draft: draft(), goal }, seq: 1, attempts: 0, ...over }
}

describe('tours-store offline write → replay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    peekAllOrdered.mockResolvedValue([])
    isOnline.value = true
    // The drain now refuses to run without a session (it would write with a stale JWT and
    // burn the retry budget), so give it one.
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue(
      { data: { session: { access_token: 't' } } } as never,
    )
  })

  it('offline create never touches the server', async () => {
    const store = useToursStore()
    isOnline.value = false
    const id = await store.createTourFromDraft(draft(), goal)

    expect(id).toBeTruthy()
    expect(store.tours).toHaveLength(1) // optimistically applied
    expect(mockCreate).not.toHaveBeenCalled() // enqueued, not written
  })

  it('a coalesced create-then-edit replays as ONE create call, never an update', async () => {
    useToursStore()
    // create + offline edits collapse to a single op=create carrying the final payload (DC1).
    peekAllOrdered.mockResolvedValue([entry({ entityId: 't1', op: 'create', payload: { draft: draft({ name: 'Renamed' }), goal } })])

    await replayQueue()

    expect(mockUpdate).not.toHaveBeenCalled() // replayed as a create, not an update
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('a draft queued by a pre-#335 build replays its single type as a one-element list', async () => {
    useToursStore()
    const { tourTypes: _, ...legacy } = draft()
    peekAllOrdered.mockResolvedValue([entry({ payload: { draft: { ...legacy, tourType: 'hiking' }, goal } })])

    await replayQueue()

    // Without the lift the RPC would get no `p_tour_types` and the type would be lost.
    expect(mockCreate.mock.calls[0]![1]).toMatchObject({ tourTypes: ['hiking'] })
    expect(mockCreate.mock.calls[0]![1]).not.toHaveProperty('tourType')
  })

  it('a replayed update whose server row is newer (LWW loser) never writes or retries', async () => {
    useToursStore()
    peekAllOrdered.mockResolvedValue([entry({
      entityId: 't-x',
      op: 'update',
      payload: { draft: draft({ name: 'Offline edit' }), goal },
      baseUpdatedAt: '2026-01-01T00:00:00Z',
      baseSnapshot: { id: 't-x', updatedAt: '2026-01-01T00:00:00Z' },
    })])
    mockGetUpdatedAt.mockResolvedValue('2026-06-01T00:00:00Z') // server moved on after our baseline

    await replayQueue()

    expect(mockUpdate).not.toHaveBeenCalled() // gated out — must not clobber the newer server row
    expect(bumpAttempt).not.toHaveBeenCalled() // not a transient retry
    expect(deadLetter).toHaveBeenCalledWith('t-x', 'conflict') // surfaced as a conflict
  })

  it('a replayed update whose server row is not newer (LWW winner) is applied', async () => {
    useToursStore()
    peekAllOrdered.mockResolvedValue([entry({
      entityId: 't-x',
      op: 'update',
      payload: { draft: draft({ name: 'Offline edit' }), goal },
      baseUpdatedAt: '2026-06-01T00:00:00Z',
      baseSnapshot: { id: 't-x', updatedAt: '2026-06-01T00:00:00Z' },
    })])
    mockGetUpdatedAt.mockResolvedValue('2026-01-01T00:00:00Z') // server older than our baseline

    await replayQueue()

    expect(mockUpdate).toHaveBeenCalledTimes(1) // won the race → the write is applied
    expect(remove).toHaveBeenCalledWith('t-x')
    expect(deadLetter).not.toHaveBeenCalled()
  })

  it('replaying a delete drops the tour GPX from Storage so it is not orphaned', async () => {
    useToursStore()
    peekAllOrdered.mockResolvedValue([entry({
      entityId: 't-del',
      op: 'delete',
      payload: {},
      baseSnapshot: { id: 't-del', gpxFilepath: 'user-1/t-del.gpx', visibility: 'private', partnerIds: [] },
    })])

    await replayQueue()

    expect(removeGpxMock).toHaveBeenCalledWith('user-1/t-del.gpx')
    expect(remove).toHaveBeenCalledWith('t-del') // entry cleared from the queue
  })

  it('replaying a delete for a tour with no GPX never calls Storage removal', async () => {
    useToursStore()
    peekAllOrdered.mockResolvedValue([entry({
      entityId: 't-del2',
      op: 'delete',
      payload: {},
      baseSnapshot: { id: 't-del2', gpxFilepath: null, visibility: 'private', partnerIds: [] },
    })])

    await replayQueue()

    expect(removeGpxMock).not.toHaveBeenCalled()
  })
})
