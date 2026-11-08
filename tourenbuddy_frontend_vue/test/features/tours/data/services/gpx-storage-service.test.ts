import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadOriginal,
  getSignedUrl,
  removeGpx,
  uploadGpx,
} from '@/features/tours/data/services/gpx-storage-service'

const { mockUpload, mockRemove, mockCreateSignedUrl } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}))

vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        remove: mockRemove,
        createSignedUrl: mockCreateSignedUrl,
      }),
    },
  },
}))

// Uploads go through the shared XHR transport, which has its own tests (abort, non-2xx,
// already-aborted signal). Stubbing it keeps this file about the GPX key + options contract.
vi.mock('@/core/utils/storage-upload', () => ({ uploadWithProgress: mockUpload }))

describe('gpxStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('uploadGpx', () => {
    it('upserts the stable key, so replacing an existing track cannot 409', async () => {
      mockUpload.mockResolvedValue(undefined)
      const file = new File(['gpx-content'], 'track.gpx')
      const result = await uploadGpx('user-123', 'tour-abc', file)
      expect(result).toBe('user-123/tour-abc.gpx')
      expect(mockUpload).toHaveBeenCalledWith(
        'tour-gpx',
        'user-123/tour-abc.gpx',
        file,
        expect.objectContaining({ upsert: true, contentType: 'application/gpx+xml' }),
      )
    })

    it('does not let a caller downgrade upsert or content type', async () => {
      mockUpload.mockResolvedValue(undefined)
      const file = new File(['gpx-content'], 'track.gpx')
      // @ts-expect-error — narrowed options type; guarding the runtime spread order too.
      await uploadGpx('user-123', 'tour-abc', file, { upsert: false, contentType: 'text/plain' })
      expect(mockUpload).toHaveBeenCalledWith(
        'tour-gpx',
        'user-123/tour-abc.gpx',
        file,
        expect.objectContaining({ upsert: true, contentType: 'application/gpx+xml' }),
      )
    })

    it('throws when upload fails', async () => {
      mockUpload.mockRejectedValue(new Error('storage full'))
      const file = new File(['gpx-content'], 'track.gpx')
      await expect(uploadGpx('user-123', 'tour-abc', file)).rejects.toThrow('storage full')
    })
  })

  describe('removeGpx', () => {
    it('removes the given filepath directly', async () => {
      mockRemove.mockResolvedValue({ error: null })
      await removeGpx('user-123/tour-abc.gpx')
      expect(mockRemove).toHaveBeenCalledWith(['user-123/tour-abc.gpx'])
    })

    it('throws when remove fails', async () => {
      mockRemove.mockResolvedValue({ error: { message: 'not found' } })
      await expect(removeGpx('user-123/tour-abc.gpx')).rejects.toThrow('not found')
    })
  })

  describe('getSignedUrl', () => {
    it('returns signed URL on success', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://example.com/signed?token=abc' },
        error: null,
      })
      const url = await getSignedUrl('tour-abc.gpx')
      expect(url).toBe('https://example.com/signed?token=abc')
    })

    it('throws when signed URL request fails', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: null,
        error: { message: 'RLS denied' },
      })
      await expect(getSignedUrl('tour-abc.gpx')).rejects.toThrow('RLS denied')
    })

    it('throws when signedUrl is missing from response', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: {}, error: null })
      await expect(getSignedUrl('tour-abc.gpx')).rejects.toThrow('Failed to get signed URL')
    })
  })

  describe('downloadOriginal', () => {
    it('throws when signed URL request fails (403)', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: '403 forbidden' } })
      await expect(downloadOriginal('tour-abc.gpx', 'my-tour.gpx')).rejects.toThrow('403 forbidden')
    })
  })
})
