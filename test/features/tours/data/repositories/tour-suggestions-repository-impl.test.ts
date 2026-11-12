import type { TourSuggestion } from '@/features/tours/domain/entities/tour-suggestion';
import { SupabaseTourSuggestionsRepository } from '@/features/tours/data/repositories/tour-suggestions-repository-impl';

const mockWarn = jest.fn();
const mockCopy = jest.fn();
const mockRemove = jest.fn(async (_bucket: string, _paths: string[]) => ({ error: null }));
const mockRpc = jest.fn();
const warn = mockWarn;
const copy = mockCopy;
const remove = mockRemove;
const rpc = mockRpc;
jest.mock('@/core/logging/logger', () => ({
  createLogger: () => ({
    warn: (...a: unknown[]) => mockWarn(...a),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  }),
}));
jest.mock('@/core/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: {
      from: (bucket: string) => ({
        copy: (...a: unknown[]) => mockCopy(...a),
        remove: (paths: string[]) => mockRemove(bucket, paths),
      }),
    },
  },
}));

function gpx(id: string) {
  return {
    id,
    tourId: 'tour-1',
    ownerId: 'owner',
    field: 'gpx',
    value: { storagePath: `friend/suggestions/tour-1/${id}.gpx` },
  } as unknown as TourSuggestion;
}
const copiedTo = (call = 0) => (copy.mock.calls[call] as unknown as [string, string])[1];

describe('supabaseTourSuggestionsRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    copy.mockResolvedValue({ error: null });
  });

  it("should copy an accepted GPX to a fresh path, never onto the tour's own track it then sweeps", async () => {
    // A tour created with a track keeps it at `<owner>/<tourId>.gpx`.
    rpc.mockResolvedValueOnce({ data: { removed_storage_path: 'owner/tour-1.gpx' }, error: null });
    await new SupabaseTourSuggestionsRepository().accept(gpx('s1'));

    expect(copiedTo()).toMatch(/^owner\/.+\.gpx$/);
    expect(copiedTo()).not.toBe('owner/tour-1.gpx');
    expect(rpc).toHaveBeenCalledWith('accept_tour_suggestion', {
      p_id: 's1',
      p_storage_path: copiedTo(),
    });
    expect(remove).toHaveBeenCalledWith('tour-gpx', ['owner/tour-1.gpx']);
  });

  it('should discard the copy when the server rejects the accept, so a retry leaves no orphan', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'not pending' } });
    await expect(new SupabaseTourSuggestionsRepository().accept(gpx('s1'))).rejects.toThrow(
      'not pending',
    );
    expect(remove).toHaveBeenCalledWith('tour-gpx', [copiedTo()]);
  });

  it.each(['', '504', 'Failed'])(
    'should keep the copy when the outcome is unknown (code %j), the accept may have committed',
    async (code) => {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'Failed to fetch' } });
      await expect(new SupabaseTourSuggestionsRepository().accept(gpx('s1'))).rejects.toThrow();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('should log the orphan when discarding a copy fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'not pending' } });
    remove.mockResolvedValueOnce({ error: { message: 'denied' } } as never);
    await expect(new SupabaseTourSuggestionsRepository().accept(gpx('s1'))).rejects.toThrow(
      'not pending',
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('orphaned'),
      expect.objectContaining({ bucket: 'tour-gpx' }),
    );
  });

  it("should discard a batch's earlier copies when a later copy fails", async () => {
    copy
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'gone' } });
    await expect(
      new SupabaseTourSuggestionsRepository().acceptBatch('b', [gpx('s1'), gpx('s2')]),
    ).rejects.toThrow('gone');
    expect(remove).toHaveBeenCalledWith('tour-gpx', [copiedTo(0)]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("should sweep a batch's replaced GPX from the GPX bucket, its removed attachments from theirs", async () => {
    rpc.mockResolvedValueOnce({
      data: { removed_storage_paths: ['owner/old.gpx', 'owner/tour-1/att.jpg'] },
      error: null,
    });
    await new SupabaseTourSuggestionsRepository().acceptBatch('b', [gpx('s1')]);
    expect(remove).toHaveBeenCalledWith('tour-gpx', ['owner/old.gpx']);
    expect(remove).toHaveBeenCalledWith('tour-attachments', ['owner/tour-1/att.jpg']);
  });
});
