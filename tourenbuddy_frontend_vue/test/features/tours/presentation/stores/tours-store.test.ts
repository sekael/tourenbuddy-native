import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'
import { useToursStore } from '@/features/tours/presentation/stores/tours-store'
import { DRAFT_FILL, TOUR_FILL } from '../../../../fixtures/tour-fill'

const {
  mockListTours,
  mockCreateTour,
  mockUpdateTour,
  mockDeleteTour,
  mockDeleteContact,
  mockDebug,
  mockError,
} = vi.hoisted(() => ({
  mockListTours: vi.fn(),
  mockCreateTour: vi.fn(),
  mockUpdateTour: vi.fn(),
  mockDeleteTour: vi.fn(),
  mockDeleteContact: vi.fn(),
  mockDebug: vi.fn(),
  mockError: vi.fn(),
}))

vi.mock('@/features/tours/data/repositories/tours-repository-impl', () => ({
  ToursRepositoryImpl: vi.fn().mockImplementation(() => ({
    listToursForUser: mockListTours,
    createTourWithPartners: mockCreateTour,
    updateTour: mockUpdateTour,
    deleteTour: mockDeleteTour,
  })),
}))

vi.mock('@/features/tours/data/services/gpx-storage-service', () => ({
  uploadGpx: vi.fn().mockResolvedValue('user-123/mock-uuid-123.gpx'),
  removeGpx: vi.fn().mockResolvedValue(undefined),
  getSignedUrl: vi.fn(),
  downloadOriginal: vi.fn(),
}))

const { mockLoadTrack } = vi.hoisted(() => ({ mockLoadTrack: vi.fn() }))
vi.mock('@/features/tours/data/services/gpx-track-service', () => ({ loadGpxTrack: mockLoadTrack }))

vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn().mockImplementation(() => ({
    fetchContacts: vi.fn().mockResolvedValue([]),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: mockDeleteContact,
  })),
}))

vi.mock('@/core/utils/phone-normalize', () => ({
  normalizePhone: vi.fn().mockReturnValue({ ok: false }),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: vi.fn().mockReturnValue({
    debug: mockDebug,
    error: mockError,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    currentUser: { id: 'user-123' },
    isAuthenticated: true,
  }),
}))

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid-123'),
}))

const mockTours = [
  {
    id: 'tour-1',
    userId: 'user-123',
    ...TOUR_FILL,
    plannedDate: null,
    goal: { lng: 8.2, lat: 46.8 },
    name: 'Rigi Tour',
    partnerIds: [],
    tourTypes: [],
    elevation: null,
    gpxFilepath: null,
    description: null,
    seasons: null,
    startPoint: null,
    endPoint: null,
    equipment: null,
    notes: null,
    completed: false,
  },
]

describe('useToursStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should load tours from repository', async () => {
    mockListTours.mockResolvedValue(mockTours)

    const store = useToursStore()
    await store.loadTours()

    expect(store.tours).toEqual(mockTours)
    expect(store.isLoading).toBe(false)
  })

  it('should create tour with minimal draft, reload, and return new id', async () => {
    mockCreateTour.mockResolvedValue(undefined)
    mockListTours.mockResolvedValue(mockTours)

    const store = useToursStore()
    const result = await store.createTourFromDraft(
      {
        name: 'Test',
        plannedDate: null,
        ...DRAFT_FILL,
        partnerIds: [],
        tourTypes: [],
        elevation: null,
        gpxFilepath: null,
        description: null,
        seasons: null,
        startPoint: null,
        endPoint: null,
        equipment: null,
        notes: null,
      },
      { lng: 8.2, lat: 46.8 },
    )

    expect(result).toBe('mock-uuid-123')
    expect(mockCreateTour).toHaveBeenCalledWith(
      'mock-uuid-123',
      expect.objectContaining({ name: 'Test' }),
      { lng: 8.2, lat: 46.8 },
    )
    expect(mockListTours).toHaveBeenCalledTimes(1)
  })

  it('should return null from createTourFromDraft when unauthenticated', async () => {
    const { useAuthStore } = await import('@/features/auth/presentation/stores/auth-store')
    vi.mocked(useAuthStore).mockReturnValueOnce({
      currentUser: null,
      isAuthenticated: false,
    } as never)

    const store = useToursStore()
    const result = await store.createTourFromDraft(
      {
        name: 'Test',
        plannedDate: null,
        ...DRAFT_FILL,
        partnerIds: [],
        tourTypes: [],
        elevation: null,
        gpxFilepath: null,
        description: null,
        seasons: null,
        startPoint: null,
        endPoint: null,
        equipment: null,
        notes: null,
      },
      { lng: 8.2, lat: 46.8 },
    )

    expect(result).toBeNull()
    expect(mockCreateTour).not.toHaveBeenCalled()
  })

  it('should create tour with all extended fields', async () => {
    mockCreateTour.mockResolvedValue(undefined)
    mockListTours.mockResolvedValue(mockTours)

    const store = useToursStore()
    await store.createTourFromDraft(
      {
        name: 'Rigi',
        plannedDate: new Date('2026-07-15'),
        ...DRAFT_FILL,
        partnerIds: ['contact-1'],
        tourTypes: ['hiking'],
        elevation: 1798,
        gpxFilepath: null,
        description: 'Great hike',
        seasons: ['summer'],
        startPoint: { lng: 8.4, lat: 47.0 },
        endPoint: null,
        equipment: 'Boots, poles',
        notes: 'Start early',
      },
      { lng: 8.4845, lat: 47.0564 },
    )

    expect(mockCreateTour).toHaveBeenCalledWith(
      'mock-uuid-123',
      expect.objectContaining({
        tourTypes: ['hiking'],
        elevation: 1798,
        seasons: ['summer'],
        equipment: 'Boots, poles',
      }),
      { lng: 8.4845, lat: 47.0564 },
    )
  })

  it('should set error on load failure', async () => {
    mockListTours.mockRejectedValue(new Error('Query failed'))

    const store = useToursStore()
    await store.loadTours()

    expect(store.error).toBe('Query failed')
    expect(store.tours).toHaveLength(0)
  })

  it('should clear tours', () => {
    const store = useToursStore()
    store.tours = [...mockTours]
    store.clear()

    expect(store.tours).toHaveLength(0)
  })

  describe('updateTour', () => {
    it('should store pre-uploaded gpxFilepath from draft without calling uploadGpx', async () => {
      const { uploadGpx } = await import('@/features/tours/data/services/gpx-storage-service')
      mockUpdateTour.mockResolvedValue(true)

      const store = useToursStore()
      store.tours = [...mockTours]

      await store.updateTour(
        'tour-1',
        {
          name: 'Rigi',
          plannedDate: null,
          ...DRAFT_FILL,
          partnerIds: [],
          tourTypes: [],
          elevation: null,
          gpxFilepath: 'user-123/pre-uploaded-uuid.gpx',
          description: null,
          seasons: null,
          startPoint: null,
          endPoint: null,
          equipment: null,
          notes: null,
        },
        { lng: 8.2, lat: 46.8 },
      )

      expect(uploadGpx).not.toHaveBeenCalled()
      expect(store.tours[0]?.gpxFilepath).toBe('user-123/pre-uploaded-uuid.gpx')
    })

    it('should replace the updated tour in the local list on success', async () => {
      mockUpdateTour.mockResolvedValue(true)

      const store = useToursStore()
      store.tours = [...mockTours]

      const updatedDraft = {
        name: 'Rigi Updated',
        plannedDate: null,
        ...DRAFT_FILL,
        partnerIds: [],
        tourTypes: [],
        elevation: 1800,
        gpxFilepath: null,
        description: null,
        seasons: null,
        startPoint: null,
        endPoint: null,
        equipment: null,
        notes: null,
      }
      const newGoal = { lng: 8.3, lat: 46.9 }

      await store.updateTour('tour-1', updatedDraft, newGoal)

      expect(store.tours).toHaveLength(1)
      expect(store.tours[0]?.name).toBe('Rigi Updated')
      expect(store.tours[0]?.elevation).toBe(1800)
      expect(store.tours[0]?.goal).toEqual(newGoal)
    })

    it('should abort (set error, no optimistic rewrite) when the tour is gone (false)', async () => {
      // update_tour_full returns false → the row no longer exists. The store must NOT
      // rewrite tours.value (would resurrect a phantom row) and must surface the error.
      mockUpdateTour.mockResolvedValue(false)

      const store = useToursStore()
      store.tours = [...mockTours]

      await expect(
        store.updateTour(
          'tour-1',
          {
            name: 'Ghost Edit',
            plannedDate: null,
            ...DRAFT_FILL,
            partnerIds: [],
            tourTypes: [],
            elevation: null,
            gpxFilepath: null,
            description: null,
            seasons: null,
            startPoint: null,
            endPoint: null,
            equipment: null,
            notes: null,
          },
          { lng: 8.2, lat: 46.8 },
        ),
      ).rejects.toThrow()

      expect(store.error).toBeTruthy()
      expect(store.tours[0]?.name).toBe('Rigi Tour')
    })

    it('should leave the list unchanged and re-throw on repository error', async () => {
      mockUpdateTour.mockRejectedValue(new Error('RPC failed'))

      const store = useToursStore()
      store.tours = [...mockTours]

      await expect(
        store.updateTour(
          'tour-1',
          {
            name: 'X',
            plannedDate: null,
            ...DRAFT_FILL,
            partnerIds: [],
            tourTypes: [],
            elevation: null,
            gpxFilepath: null,
            description: null,
            seasons: null,
            startPoint: null,
            endPoint: null,
            equipment: null,
            notes: null,
          },
          { lng: 8.2, lat: 46.8 },
        ),
      ).rejects.toThrow('RPC failed')

      expect(store.tours[0]?.name).toBe('Rigi Tour')
    })
  })

  describe('setCompleted', () => {
    it('should flip completed through the unified update RPC (Path Y)', async () => {
      mockUpdateTour.mockResolvedValue(true)

      const store = useToursStore()
      store.tours = [...mockTours]

      await store.setCompleted('tour-1', true)

      expect(store.tours[0]?.completed).toBe(true)
      // A field-toggle is a full tour update carrying the changed field.
      expect(mockUpdateTour).toHaveBeenCalledWith(
        'tour-1',
        expect.objectContaining({ completed: true }),
        { lng: 8.2, lat: 46.8 },
      )
    })

    it('should surface an error and leave completed unchanged when the update fails', async () => {
      mockUpdateTour.mockRejectedValue(new Error('update failed'))

      const store = useToursStore()
      store.tours = [...mockTours]

      // Behaves like updateTour: rejects on failure; the optimistic rewrite only lands
      // after a confirmed write, so a failure never flips the local value.
      await expect(store.setCompleted('tour-1', true)).rejects.toThrow()
      expect(store.tours[0]?.completed).toBe(false)
      expect(store.error).toBeTruthy()
    })

    it('should emit a debug log on toggle', async () => {
      mockUpdateTour.mockResolvedValue(true)

      const store = useToursStore()
      store.tours = [...mockTours]

      await store.setCompleted('tour-1', true)

      expect(mockDebug).toHaveBeenCalledWith('setCompleted', { tourId: 'tour-1', completed: true })
    })

    it('should do nothing when tourId not found', async () => {
      const store = useToursStore()
      store.tours = [...mockTours]

      await store.setCompleted('nonexistent', true)

      expect(mockUpdateTour).not.toHaveBeenCalled()
    })
  })

  describe('deleteTour', () => {
    it('should remove the tour from the local list on success', async () => {
      mockDeleteTour.mockResolvedValue(undefined)

      const store = useToursStore()
      store.tours = [...mockTours]

      await store.deleteTour('tour-1')

      expect(store.tours).toHaveLength(0)
    })

    it('should leave the list unchanged and re-throw on repository error', async () => {
      mockDeleteTour.mockRejectedValue(new Error('Delete failed'))

      const store = useToursStore()
      store.tours = [...mockTours]

      await expect(store.deleteTour('tour-1')).rejects.toThrow('Delete failed')
      expect(store.tours).toHaveLength(1)
    })
  })

  describe('partnerIds reconciliation on contact deletion', () => {
    const tourWithPartner = {
      id: 'tour-a',
      userId: 'user-123',
      ...TOUR_FILL,
      plannedDate: null,
      goal: { lng: 8.2, lat: 46.8 },
      name: 'Alpine Tour',
      partnerIds: ['contact-deleted', 'contact-kept'],
      tourTypes: [],
      elevation: 1200,
      gpxFilepath: null,
      description: 'A great tour',
      seasons: null,
      startPoint: null,
      endPoint: null,
      equipment: null,
      notes: null,
      completed: false,
    }

    const tourWithoutPartner = {
      id: 'tour-b',
      userId: 'user-123',
      ...TOUR_FILL,
      plannedDate: null,
      goal: { lng: 7.1, lat: 46.5 },
      name: 'Valley Tour',
      partnerIds: ['contact-kept'],
      tourTypes: [],
      elevation: null,
      gpxFilepath: null,
      description: null,
      seasons: null,
      startPoint: null,
      endPoint: null,
      equipment: null,
      notes: null,
      completed: false,
    }

    it('should remove deleted contact id from all affected cached tours', async () => {
      mockDeleteContact.mockResolvedValue(undefined)

      const toursStore = useToursStore()
      const contactsStore = useContactsStore()
      toursStore.tours = [tourWithPartner, tourWithoutPartner]

      await contactsStore.deleteContact('contact-deleted')

      expect(toursStore.tours[0]!.partnerIds).not.toContain('contact-deleted')
      expect(toursStore.tours[0]!.partnerIds).toContain('contact-kept')
      expect(toursStore.tours[1]!.partnerIds).toEqual(['contact-kept'])
    })

    it('should leave tours.value unchanged when deleteContact rejects', async () => {
      mockDeleteContact.mockRejectedValue(new Error('FK violation'))

      const toursStore = useToursStore()
      const contactsStore = useContactsStore()
      toursStore.tours = [tourWithPartner]
      const originalRef = toursStore.tours

      await expect(contactsStore.deleteContact('contact-deleted')).rejects.toThrow('FK violation')

      expect(toursStore.tours).toBe(originalRef)
      expect(toursStore.tours[0]!.partnerIds).toContain('contact-deleted')
    })

    it('should not mutate tours.value when deleted contact is not referenced', async () => {
      mockDeleteContact.mockResolvedValue(undefined)

      const toursStore = useToursStore()
      const contactsStore = useContactsStore()
      toursStore.tours = [tourWithoutPartner]
      const originalRef = toursStore.tours

      await contactsStore.deleteContact('contact-unreferenced')

      expect(toursStore.tours).toBe(originalRef)
    })

    it('should preserve all other tour fields after reconciliation', async () => {
      mockDeleteContact.mockResolvedValue(undefined)

      const toursStore = useToursStore()
      const contactsStore = useContactsStore()
      toursStore.tours = [tourWithPartner]

      await contactsStore.deleteContact('contact-deleted')

      const updated = toursStore.tours[0]!
      expect(updated.name).toBe('Alpine Tour')
      expect(updated.elevation).toBe(1200)
      expect(updated.description).toBe('A great tour')
      expect(updated.id).toBe('tour-a')
    })
  })
})

describe('useToursStore: outings (#338)', () => {
  const outing = { id: 'o1', name: null, position: 0 }
  const seg = (id: string, position: number) => ({ ...mockTours[0]!, id, outing: { ...outing, position } })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpdateTour.mockResolvedValue(true)
  })

  /** The membership each `updateTour` call sent, by tour id. */
  const sentOutings = () => Object.fromEntries(mockUpdateTour.mock.calls.map(([id, draft]) => [id, draft.outing]))

  it('should keep the legs of a draft that knows none only while the activities stay', async () => {
    const store = useToursStore()
    const legs = { ascent: ['hiking'], descent: ['paragliding'] } as const
    store.tours = [{ ...mockTours[0]!, tourTypes: ['paragliding', 'hiking'], legs: { ascent: [...legs.ascent], descent: [...legs.descent] } }]
    const { legs: _legs, ...draft } = store.tours[0]!
    await store.updateTour(draft.id, draft, draft.goal)
    expect(store.tours[0]!.legs).toEqual(legs)
    await store.updateTour(draft.id, { ...draft, tourTypes: ['hiking'] }, draft.goal)
    expect(store.tours[0]!.legs).toBeNull()
  })

  it('should keep a segment in its outing when an edit draft does not mention the outing', async () => {
    const store = useToursStore()
    store.tours = [seg('a', 0)]
    const { outing: _membership, ...formDraft } = store.tours[0]!
    await store.updateTour('a', { ...formDraft, name: 'Renamed' }, formDraft.goal)
    expect(store.tours[0]).toMatchObject({ name: 'Renamed', outing })
  })

  it('should dissolve the outing when removing leaves a single segment', async () => {
    const store = useToursStore()
    store.tours = [seg('a', 0), seg('b', 1)]
    await store.removeFromOuting(store.tours, 'a')
    expect(sentOutings()).toEqual({ a: null, b: null })
  })

  it('should keep a three-segment outing when one segment leaves', async () => {
    const store = useToursStore()
    store.tours = [seg('a', 0), seg('b', 1), seg('c', 2)]
    await store.removeFromOuting(store.tours, 'b')
    expect(sentOutings()).toEqual({ b: null })
  })

  it('should renumber on a move so tied positions settle', async () => {
    const store = useToursStore()
    store.tours = [seg('a', 0), seg('b', 0), seg('c', 7)]
    // a, b, c → a, c, b: renumbered 0, 1, 2; `a` already sits at 0.
    await store.reorderSegments(store.tours, 2, 1)
    expect(sentOutings()).toEqual({ c: { ...outing, position: 1 }, b: { ...outing, position: 2 } })
  })

  it('should connect a gap by ending the previous segment at the next one\'s start, and skip a startless next', async () => {
    const store = useToursStore()
    const hut = { lng: 8.43, lat: 46.71 }
    store.tours = [seg('a', 0), { ...seg('b', 1), startPoint: hut, startPointName: 'Tierberglihütte SAC', startPointElevation: 2795 }]
    await store.connectSegments(store.tours[0]!, store.tours[1]!)
    expect(mockUpdateTour).toHaveBeenCalledTimes(1)
    expect(mockUpdateTour.mock.calls[0]![0]).toBe('a')
    expect(mockUpdateTour.mock.calls[0]![1]).toMatchObject({ endPoint: hut, endPointName: 'Tierberglihütte SAC', endPointElevation: 2795 })

    await store.connectSegments(store.tours[0]!, { ...store.tours[1]!, startPoint: null })
    expect(mockUpdateTour).toHaveBeenCalledTimes(1)
  })

  it('should restore the old order when a reorder write fails', async () => {
    const store = useToursStore()
    store.tours = [seg('a', 0), seg('b', 1)]
    const before = store.tours
    mockUpdateTour.mockRejectedValueOnce(new Error('boom'))
    await expect(store.reorderSegments(store.tours, 0, 1)).rejects.toThrow('boom')
    expect(store.tours).toBe(before)
  })

  it('should mint an outing for a standalone anchor and append the added tour after it', async () => {
    const store = useToursStore()
    store.tours = [{ ...mockTours[0]!, id: 'anchor' }, { ...mockTours[0]!, id: 'other' }]
    await store.addToOuting('anchor', 'other')
    expect(sentOutings()).toEqual({
      anchor: { id: 'mock-uuid-123', name: null, position: 0 },
      other: { id: 'mock-uuid-123', name: null, position: 1 },
    })
  })

  it('should not touch a segment whose name already matches on rename', async () => {
    const store = useToursStore()
    store.tours = [{ ...seg('a', 0), outing: { ...outing, name: 'Route' } }, seg('b', 1)]
    await store.renameOuting(store.tours, '  Route ')
    expect(sentOutings()).toEqual({ b: { ...outing, name: 'Route', position: 1 } })
  })

  describe('dropIfDuplicate', () => {
    const line = (lng: number): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[8.1, 46.3, 1400], [lng, 46.38, 2500]] } }],
    })
    const planned = { ...mockTours[0]!, id: 'planned', name: 'Eggerhorn', tourTypes: ['skitour' as const], gpxFilepath: 'user-123/planned.gpx' }
    const draft = (changes: object = {}) => ({ ...DRAFT_FILL, ...planned, gpxFilepath: 'user-123/copy.gpx', ...changes })

    it('should hand back the tour planned before and drop only the copy\'s upload, never a file a tour holds', async () => {
      mockListTours.mockResolvedValue([planned])
      mockLoadTrack.mockResolvedValue(line(8.1835))
      const { removeGpx } = await import('@/features/tours/data/services/gpx-storage-service')
      const store = useToursStore()
      await store.loadTours()

      expect((await store.dropIfDuplicate(draft(), planned.goal))?.id).toBe('planned')
      expect(removeGpx).toHaveBeenCalledWith('user-123/copy.gpx')
      vi.mocked(removeGpx).mockClear()
      // A form seeded with the tour's own file.
      expect((await store.dropIfDuplicate(draft({ gpxFilepath: 'user-123/planned.gpx' }), planned.goal))?.id).toBe('planned')
      expect(removeGpx).not.toHaveBeenCalled()
    })

    it('should let the copy be saved when one field or one track point differs, or a track can\'t load', async () => {
      mockListTours.mockResolvedValue([planned])
      const store = useToursStore()
      await store.loadTours()

      expect(await store.dropIfDuplicate(draft({ plannedDate: new Date('2027-02-14') }), planned.goal)).toBeNull()
      mockLoadTrack.mockImplementation(async ({ gpxFilepath }) => line(gpxFilepath.includes('copy') ? 8.18351 : 8.1835))
      expect(await store.dropIfDuplicate(draft(), planned.goal)).toBeNull()
      mockLoadTrack.mockResolvedValue(null)
      expect(await store.dropIfDuplicate(draft(), planned.goal)).toBeNull()
    })
  })
})
