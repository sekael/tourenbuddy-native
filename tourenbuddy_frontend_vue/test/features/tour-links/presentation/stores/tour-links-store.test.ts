import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store'

// Mock realtime so the store doesn't try to subscribe in unit tests.
vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: () => ({}),
}))

// Mock auth + tours stores via createPinia — kept minimal.
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: () => ({ isAuthenticated: true, currentUser: { id: 'me' } }),
}))
vi.mock('@/features/tours/presentation/stores/tours-store', () => ({
  useToursStore: () => ({ tours: [{ id: 't1' }, { id: 't2' }], friendTours: [] }),
}))

const { mockRepo } = vi.hoisted(() => ({
  mockRepo: {
    listGroupsForTours: vi.fn(),
    listFriendTourGroupIds: vi.fn().mockResolvedValue([]),
    listPendingRequestsForTours: vi.fn(),
    createRequest: vi.fn(),
    acceptRequest: vi.fn(),
    declineRequest: vi.fn(),
    withdrawRequest: vi.fn(),
  },
}))

vi.mock('@/features/tour-links/data/repositories/tour-links-repository-impl', () => ({
  TourLinksRepositoryImpl: vi.fn(() => mockRepo),
}))

describe('tour-links-store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.values(mockRepo).forEach(fn => fn.mockReset())
    // Default: no friend-tour groups visible. Individual tests override as needed.
    mockRepo.listFriendTourGroupIds.mockResolvedValue([])
  })

  it('siblingsByTourId excludes the tour itself', async () => {
    mockRepo.listGroupsForTours.mockResolvedValue([
      { groupId: 'g1', tourId: 't1', joinedAt: new Date() },
      { groupId: 'g1', tourId: 'tx', joinedAt: new Date() },
      { groupId: 'g1', tourId: 'ty', joinedAt: new Date() },
    ])
    mockRepo.listPendingRequestsForTours.mockResolvedValue([])
    const store = useTourLinksStore()
    await store.fetchAll()
    const siblings = store.siblingsByTourId.get('t1')
    expect(siblings).toEqual(['tx', 'ty'])
  })

  it('createRequest propagates RPC errors', async () => {
    mockRepo.createRequest.mockRejectedValue(new Error('tour_link.predicate_failed'))
    mockRepo.listGroupsForTours.mockResolvedValue([])
    mockRepo.listPendingRequestsForTours.mockResolvedValue([])
    const store = useTourLinksStore()
    await expect(store.createRequest('t1', 'tf')).rejects.toThrow('predicate_failed')
  })
})
