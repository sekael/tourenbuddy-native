import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAvailabilityStore } from '@/features/calendar/presentation/stores/availability-store'

// Repository test double (mock the interface, not supabase). The store news the
// concrete impl at module load, so replace that module with a stub whose methods
// are shared vi.fns we can assert against.
const { listOwnFrom, applyDiff, listFriendsFrom } = vi.hoisted(() => ({
  listOwnFrom: vi.fn(),
  applyDiff: vi.fn(),
  listFriendsFrom: vi.fn(),
}))

vi.mock('@/features/calendar/data/repositories/availability-repository-impl', () => ({
  SupabaseAvailabilityRepository: vi.fn(() => ({ listOwnFrom, applyDiff, listFriendsFrom })),
}))

// Freeze "today" so future/past reasoning is deterministic.
vi.mock('@/features/calendar/domain/calendar-dates', async (orig) => {
  const actual = await orig<typeof import('@/features/calendar/domain/calendar-dates')>()
  return { ...actual, todayKey: () => '2026-07-10' }
})

describe('useAvailabilityStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    listOwnFrom.mockResolvedValue([])
    applyDiff.mockResolvedValue(undefined)
  })

  it('records an error and keeps editing open when the save fails', async () => {
    listOwnFrom.mockResolvedValue(['2026-08-01'])
    applyDiff.mockRejectedValue(new Error('network down'))
    const store = useAvailabilityStore()
    await store.load()
    store.enterEdit()
    store.toggleDay('2026-08-05')

    await store.save()

    expect(store.error).toBe('network down')
    expect(store.editing).toBe(true) // stays open so the user can retry
  })

  it('sends only the diff (added + removed), not the whole set', async () => {
    listOwnFrom.mockResolvedValue(['2026-08-01', '2026-08-02'])
    const store = useAvailabilityStore()
    await store.load()
    store.enterEdit()
    store.toggleDay('2026-08-05') // add
    store.toggleDay('2026-08-01') // remove

    await store.save()

    expect(applyDiff).toHaveBeenCalledTimes(1)
    const [added, removed] = applyDiff.mock.calls[0]
    expect([...added].sort()).toEqual(['2026-08-05'])
    expect([...removed].sort()).toEqual(['2026-08-01'])
    expect(store.editing).toBe(false)
  })

  it('does not call the RPC when nothing changed', async () => {
    listOwnFrom.mockResolvedValue(['2026-08-01'])
    const store = useAvailabilityStore()
    await store.load()
    store.enterEdit()

    await store.save()

    expect(applyDiff).not.toHaveBeenCalled()
    expect(store.editing).toBe(false)
  })

  it('discards the working set on cancel without persisting', async () => {
    listOwnFrom.mockResolvedValue(['2026-08-01'])
    const store = useAvailabilityStore()
    await store.load()
    store.enterEdit()
    store.toggleDay('2026-08-09')
    store.cancel()

    expect(store.editing).toBe(false)
    expect(applyDiff).not.toHaveBeenCalled()
    // View-mode overlay still reflects the saved set, unchanged.
    expect([...store.displayDays]).toEqual(['2026-08-01'])
  })
})
