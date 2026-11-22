import {
  getSignedUrl,
  removeGpx,
  shareOriginal,
  uploadGpx,
} from '@/features/tours/data/services/gpx-storage-service';

const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockShare = jest.fn();

jest.mock('@/core/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        remove: (...a: unknown[]) => mockRemove(...a),
        createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a),
      }),
    },
  },
}));

jest.mock('@/core/files', () => ({ shareRemoteFile: (...a: unknown[]) => mockShare(...a) }));

// Uploads go through the shared XHR transport, which has its own tests (abort, non-2xx,
// already-aborted signal). Stubbing it keeps this file about the GPX key + options contract.
jest.mock('@/core/utils/storage-upload', () => ({
  uploadWithProgress: (...a: unknown[]) => mockUpload(...a),
}));

describe('gpxStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadGpx', () => {
    it('upserts the stable key, so replacing an existing track cannot 409', async () => {
      mockUpload.mockResolvedValue(undefined);
      const file = new File(['gpx-content'], 'track.gpx');
      const result = await uploadGpx('user-123', 'tour-abc', file);
      expect(result).toBe('user-123/tour-abc.gpx');
      expect(mockUpload).toHaveBeenCalledWith(
        'tour-gpx',
        'user-123/tour-abc.gpx',
        file,
        expect.objectContaining({ upsert: true, contentType: 'application/gpx+xml' }),
      );
    });

    it('does not let a caller downgrade upsert or content type', async () => {
      mockUpload.mockResolvedValue(undefined);
      const file = new File(['gpx-content'], 'track.gpx');
      // @ts-expect-error — narrowed options type; guarding the runtime spread order too.
      await uploadGpx('user-123', 'tour-abc', file, { upsert: false, contentType: 'text/plain' });
      expect(mockUpload).toHaveBeenCalledWith(
        'tour-gpx',
        'user-123/tour-abc.gpx',
        file,
        expect.objectContaining({ upsert: true, contentType: 'application/gpx+xml' }),
      );
    });

    it('throws when upload fails', async () => {
      mockUpload.mockRejectedValue(new Error('storage full'));
      const file = new File(['gpx-content'], 'track.gpx');
      await expect(uploadGpx('user-123', 'tour-abc', file)).rejects.toThrow('storage full');
    });
  });

  describe('removeGpx', () => {
    it('removes the given filepath directly', async () => {
      mockRemove.mockResolvedValue({ error: null });
      await removeGpx('user-123/tour-abc.gpx');
      expect(mockRemove).toHaveBeenCalledWith(['user-123/tour-abc.gpx']);
    });

    it('throws when remove fails', async () => {
      mockRemove.mockResolvedValue({ error: { message: 'not found' } });
      await expect(removeGpx('user-123/tour-abc.gpx')).rejects.toThrow('not found');
    });
  });

  describe('getSignedUrl', () => {
    it('returns signed URL on success', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://example.com/signed?token=abc' },
        error: null,
      });
      const url = await getSignedUrl('tour-abc.gpx');
      expect(url).toBe('https://example.com/signed?token=abc');
    });

    it('throws when signed URL request fails', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: null,
        error: { message: 'RLS denied' },
      });
      await expect(getSignedUrl('tour-abc.gpx')).rejects.toThrow('RLS denied');
    });

    it('throws when signedUrl is missing from response', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: {}, error: null });
      await expect(getSignedUrl('tour-abc.gpx')).rejects.toThrow('Failed to get signed URL');
    });
  });

  describe('shareOriginal', () => {
    it('throws when signed URL request fails (403), sharing nothing', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: '403 forbidden' } });
      await expect(shareOriginal('tour-abc.gpx', 'my-tour')).rejects.toThrow('403 forbidden');
      expect(mockShare).not.toHaveBeenCalled();
    });

    it('names the shared file after the tour, with a single .gpx extension', async () => {
      mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://s/x' }, error: null });
      await shareOriginal('u/t.gpx', 'Piz Ela');
      await shareOriginal('u/t.gpx', 'Piz Ela.gpx');
      expect(mockShare.mock.calls.map((c) => c[1])).toEqual(['Piz Ela.gpx', 'Piz Ela.gpx']);
    });
  });
});
