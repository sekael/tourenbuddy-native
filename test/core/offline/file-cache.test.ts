import { loadCachedFile, loadCachedText } from '@/core/offline/file-cache';

// An in-memory expo-file-system: files by uri, which is all the cache touches.
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class MockDirectory {
    uri: string;
    exists = true;
    constructor(parent: { uri: string } | string, name = '') {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name}/`;
    }
    create() {}
  }
  class MockFile {
    uri: string;
    constructor(dir: { uri: string } | string, name = '') {
      this.uri = typeof dir === 'string' ? dir : `${dir.uri}${name}`;
    }
    get exists() {
      return files.has(this.uri);
    }
    text() {
      return Promise.resolve(files.get(this.uri)!);
    }
    create() {
      if (this.uri.includes('readonly')) throw new Error('read-only');
      files.set(this.uri, '');
    }
    write(text: string) {
      files.set(this.uri, text);
    }
    static downloadFileAsync = jest.fn(async (_url: string, to: MockFile) => {
      files.set(to.uri, 'downloaded');
      return to;
    });
  }
  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: 'file:///doc/' },
    __files: files,
  };
});

const fs = jest.requireMock<{
  __files: Map<string, string>;
  File: { downloadFileAsync: jest.Mock };
}>('expo-file-system');

beforeEach(() => {
  fs.__files.clear();
  fs.File.downloadFileAsync.mockClear();
});

// The PWA's blob-cache.test.ts: files never change under their key, so the cache always comes first.
describe('loadCachedText', () => {
  it('should serve the cached copy without any request', async () => {
    await loadCachedText('u1/a.gpx', async () => '<gpx v1/>');
    const fetchText = jest.fn(async () => '<gpx v2/>');
    expect(await loadCachedText('u1/a.gpx', fetchText)).toBe('<gpx v1/>');
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('should return undefined offline with nothing cached, not throw', async () => {
    const offline = async (): Promise<string> => {
      throw new TypeError('Network request failed');
    };
    await expect(loadCachedText('u1/a.gpx', offline)).resolves.toBeUndefined();
  });

  it('should still return the text when it cannot be cached', async () => {
    await expect(loadCachedText('readonly/a.gpx', async () => '<gpx/>')).resolves.toBe('<gpx/>');
  });
});

describe('loadCachedFile', () => {
  it('should download once, then serve the local file without a request', async () => {
    const url = jest.fn(async () => 'https://storage/a.jpg');
    const first = await loadCachedFile('u1/a.jpg', url);
    const second = await loadCachedFile('u1/a.jpg', url);
    expect(second).toBe(first);
    expect(fs.File.downloadFileAsync).toHaveBeenCalledTimes(1);
    expect(url).toHaveBeenCalledTimes(1);
  });

  it('should return undefined offline with nothing cached', async () => {
    const url = async (): Promise<string> => {
      throw new TypeError('Network request failed');
    };
    await expect(loadCachedFile('u1/a.jpg', url)).resolves.toBeUndefined();
  });
});
