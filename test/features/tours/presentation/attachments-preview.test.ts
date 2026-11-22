import { File } from 'expo-file-system';

import { cachedUri } from '@/core/offline/file-cache';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';
import { previewAttachments } from '@/features/tours/presentation/attachments-section';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';

jest.mock('expo-file-system', () => ({
  ...jest.requireActual('expo-file-system'),
  File: Object.assign(
    jest.fn((uri: string) => ({ uri })),
    { preview: jest.fn(async () => {}) },
  ),
}));
jest.mock('@/core/offline/file-cache', () => ({
  ...jest.requireActual('@/core/offline/file-cache'),
  cachedUri: jest.fn(),
}));

const preview = (File as unknown as { preview: jest.Mock }).preview;
const attachment = (storagePath: string) => ({ storagePath }) as TourAttachment;
const t = ((key: string) => key) as never;

describe('previewAttachments', () => {
  it('should fetch only the tapped file and swipe through the cached ones', async () => {
    const localUri = jest.fn(async () => 'file:///tapped');
    useTourAttachmentsStore.setState({ localUri });
    jest.mocked(cachedUri).mockImplementation((key) => (key === 'a' ? 'file:///a' : undefined));

    await previewAttachments([attachment('a'), attachment('b'), attachment('c')], 2, t);

    expect(localUri).toHaveBeenCalledTimes(1);
    const [files, options] = preview.mock.calls[0]!;
    expect((files as { uri: string }[]).map((f) => f.uri)).toEqual(['file:///a', 'file:///tapped']);
    expect(options).toEqual({ initialIndex: 1 });
  });
});
