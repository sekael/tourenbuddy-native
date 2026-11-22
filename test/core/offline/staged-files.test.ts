import { clearPendingUpload, isPendingUpload, stageText } from '@/core/offline/staged-files';

import { fakeTables } from '../../support/fake-tables';

jest.mock('@/core/offline/file-cache', () => ({
  stageFileText: jest.fn(),
  unstageFile: jest.fn(),
  cachedUri: jest.fn(),
}));

// The PWA's blob-cache.test.ts, for files staged offline.
describe('staged files', () => {
  beforeEach(() => fakeTables.reset());

  it('should mark a staged GPX as pending, and only that key', async () => {
    await stageText('u1/a.gpx', '<gpx/>');
    expect(await isPendingUpload('u1/a.gpx')).toBe(true);
    expect(await isPendingUpload('u1/b.gpx')).toBe(false);
  });

  it('should clear the mark once uploaded', async () => {
    await stageText('u1/a.gpx', '<gpx/>');
    await clearPendingUpload('u1/a.gpx');
    expect(await isPendingUpload('u1/a.gpx')).toBe(false);
  });
});
