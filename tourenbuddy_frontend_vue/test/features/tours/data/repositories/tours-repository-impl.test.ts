import type { TourDraft } from '@/features/tours/domain/entities/tour'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToursRepositoryImpl } from '@/features/tours/data/repositories/tours-repository-impl'
import { DRAFT_FILL } from '../../../../fixtures/tour-fill'

const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

const baseDraft: TourDraft = {
  ...DRAFT_FILL,
  name: 'Test Tour',
  plannedDate: null,
  partnerIds: [],
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
}
const goal = { lng: 8.2, lat: 46.8 }

describe('toursRepositoryImpl: new RPC params', () => {
  let repo: ToursRepositoryImpl

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new ToursRepositoryImpl()
  })

  describe('createTourWithPartners', () => {
    it('passes null metadata params when draft has no start/end names', async () => {
      mockRpc.mockResolvedValue({ error: null })
      await repo.createTourWithPartners('id-1', baseDraft, goal)
      expect(mockRpc).toHaveBeenCalledWith(
        'create_tour_full',
        expect.objectContaining({
          p_start_point_name: null,
          p_start_point_elevation: null,
          p_end_point_name: null,
          p_end_point_elevation: null,
        }),
      )
    })

    it('passes metadata when draft has start/end names and elevations', async () => {
      mockRpc.mockResolvedValue({ error: null })
      const draft: TourDraft = {
        ...baseDraft,
        startPointName: 'Grindelwald',
        startPointElevation: 1034,
        endPointName: 'Kleine Scheidegg',
        endPointElevation: 2061,
      }
      await repo.createTourWithPartners('id-1', draft, goal)
      expect(mockRpc).toHaveBeenCalledWith(
        'create_tour_full',
        expect.objectContaining({
          p_start_point_name: 'Grindelwald',
          p_start_point_elevation: 1034,
          p_end_point_name: 'Kleine Scheidegg',
          p_end_point_elevation: 2061,
        }),
      )
    })

    it('passes gpxFilepath through RPC', async () => {
      mockRpc.mockResolvedValue({ error: null })
      const draft: TourDraft = { ...baseDraft, gpxFilepath: 'abc-123.gpx' }
      await repo.createTourWithPartners('id-1', draft, goal)
      expect(mockRpc).toHaveBeenCalledWith(
        'create_tour_full',
        expect.objectContaining({ p_gpx_filepath: 'abc-123.gpx' }),
      )
    })

    it('folds visibility into the RPC (p_visibility), null when omitted', async () => {
      mockRpc.mockResolvedValue({ error: null })
      await repo.createTourWithPartners('id-1', baseDraft, goal)
      expect(mockRpc).toHaveBeenCalledWith(
        'create_tour_full',
        expect.objectContaining({ p_visibility: null }),
      )
      const draft: TourDraft = { ...baseDraft, visibility: 'private' }
      await repo.createTourWithPartners('id-2', draft, goal)
      expect(mockRpc).toHaveBeenLastCalledWith(
        'create_tour_full',
        expect.objectContaining({ p_visibility: 'private' }),
      )
    })

    it('throws when RPC returns an error', async () => {
      mockRpc.mockResolvedValue({ error: { message: 'permission denied' } })
      await expect(repo.createTourWithPartners('id-1', baseDraft, goal)).rejects.toThrow(
        'permission denied',
      )
    })
  })

  describe('updateTour', () => {
    it('passes null metadata params when draft has no start/end names', async () => {
      mockRpc.mockResolvedValue({ error: null })
      await repo.updateTour('id-1', baseDraft, goal)
      expect(mockRpc).toHaveBeenCalledWith(
        'update_tour_full',
        expect.objectContaining({
          p_start_point_name: null,
          p_start_point_elevation: null,
          p_end_point_name: null,
          p_end_point_elevation: null,
        }),
      )
    })

    it('passes metadata when draft has start/end names', async () => {
      mockRpc.mockResolvedValue({ error: null })
      const draft: TourDraft = {
        ...baseDraft,
        startPointName: 'Lauterbrunnen',
        startPointElevation: 796,
        endPointName: null,
        endPointElevation: null,
      }
      await repo.updateTour('id-1', draft, goal)
      expect(mockRpc).toHaveBeenCalledWith(
        'update_tour_full',
        expect.objectContaining({
          p_start_point_name: 'Lauterbrunnen',
          p_start_point_elevation: 796,
          p_end_point_name: null,
          p_end_point_elevation: null,
        }),
      )
    })

    it('passes null gpxFilepath when track removed', async () => {
      mockRpc.mockResolvedValue({ error: null })
      const draft: TourDraft = { ...baseDraft, gpxFilepath: null }
      await repo.updateTour('id-1', draft, goal)
      expect(mockRpc).toHaveBeenCalledWith(
        'update_tour_full',
        expect.objectContaining({ p_gpx_filepath: null }),
      )
    })

    it('passes null p_visibility when omitted (COALESCE leaves it untouched)', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null })
      await repo.updateTour('id-1', baseDraft, goal)
      expect(mockRpc).toHaveBeenCalledWith(
        'update_tour_full',
        expect.objectContaining({ p_visibility: null }),
      )
    })

    it('returns false when the RPC reports no row updated (tour gone)', async () => {
      mockRpc.mockResolvedValue({ data: false, error: null })
      await expect(repo.updateTour('id-1', baseDraft, goal)).resolves.toBe(false)
    })

    it('returns true when a row was updated', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null })
      await expect(repo.updateTour('id-1', baseDraft, goal)).resolves.toBe(true)
    })
  })
})

describe('toursRepositoryImpl: p_outing (#338, D12)', () => {
  const repo = new ToursRepositoryImpl()
  const outing = { id: 'o1', name: 'Haute Route', position: 2 }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: true, error: null })
  })

  it('should send null when the draft does not touch the outing, so the server keeps it', async () => {
    await repo.updateTour('id-1', baseDraft, goal)
    expect(mockRpc).toHaveBeenCalledWith('update_tour_full', expect.objectContaining({ p_outing: null }))
  })

  it('should send an empty object to leave the outing', async () => {
    await repo.updateTour('id-1', { ...baseDraft, outing: null }, goal)
    expect(mockRpc).toHaveBeenCalledWith('update_tour_full', expect.objectContaining({ p_outing: {} }))
  })

  it('should send the membership when creating a segment', async () => {
    await repo.createTourWithPartners('id-1', { ...baseDraft, outing }, goal)
    expect(mockRpc).toHaveBeenCalledWith('create_tour_full', expect.objectContaining({ p_outing: outing }))
  })
})

describe('toursRepositoryImpl: p_grade / p_start_time (smarter-tour-creation D5)', () => {
  const repo = new ToursRepositoryImpl()

  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: true, error: null })
  })

  it('should send null for a draft that predates the fields, so the server keeps them', async () => {
    await repo.updateTour('id-1', baseDraft, goal)
    expect(mockRpc).toHaveBeenCalledWith('update_tour_full', expect.objectContaining({ p_grade: null, p_start_time: null }))
  })

  it('should send an empty string to clear, and the value to set', async () => {
    await repo.updateTour('id-1', { ...baseDraft, grade: null, startTime: '06:30' }, goal)
    expect(mockRpc).toHaveBeenCalledWith('update_tour_full', expect.objectContaining({ p_grade: '', p_start_time: '06:30' }))
  })
})

describe('toursRepositoryImpl: legs (activity-legs D2)', () => {
  const repo = new ToursRepositoryImpl()

  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: true, error: null })
  })

  it('should send null legs for a draft that knows none, and empty ones to unsplit', async () => {
    await repo.updateTour('id-1', baseDraft, goal)
    expect(mockRpc).toHaveBeenCalledWith('update_tour_full', expect.objectContaining({ p_ascent_types: null, p_descent_types: null }))
    await repo.updateTour('id-1', { ...baseDraft, legs: null }, goal)
    expect(mockRpc).toHaveBeenLastCalledWith('update_tour_full', expect.objectContaining({ p_ascent_types: [], p_descent_types: [] }))
  })
})
