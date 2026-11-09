import type { AppStateStatus } from 'react-native';

jest.unmock('@/core/auth/auth-storage');

// The Keychain and the document directory, in memory.
const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockKeychain.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockKeychain.delete(key)),
}));
const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_dir: string, name: string) {
      this.name = name;
    }
    get exists() {
      return mockFiles.has(this.name);
    }
    create() {
      mockFiles.add(this.name);
    }
  },
}));

type Module = typeof import('@/core/auth/auth-storage');
type AppStateListener = (state: AppStateStatus) => void;

/** The adapter as loaded at launch, with the app in `state`. */
function launch(state: AppStateStatus = 'active') {
  const listeners = new Set<AppStateListener>();
  let loaded!: Module;
  jest.isolateModules(() => {
    const { AppState } = jest.requireActual<typeof import('react-native')>('react-native');
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      listeners.add(listener as AppStateListener);
      return { remove: () => listeners.delete(listener as AppStateListener) };
    });
    loaded = jest.requireActual<Module>('@/core/auth/auth-storage');
  });
  const foreground = () => listeners.forEach((listener) => listener('active'));
  return { ...loaded, foreground };
}

const SecureStore = jest.requireMock<typeof import('expo-secure-store')>('expo-secure-store');

beforeEach(() => {
  mockKeychain.clear();
  mockFiles.clear();
  jest.clearAllMocks();
});

describe('authStorage', () => {
  it('should keep the session on this device and readable after the first unlock', async () => {
    mockFiles.add('installed');
    const { authStorage } = launch();

    await authStorage.setItem('session', 'value');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('session', 'value', {
      keychainAccessible: 'after-first-unlock-this-device-only',
    });
    expect(await authStorage.getItem('session')).toBe('value');
  });

  it('should delete a session the Keychain kept from an earlier install before reading', async () => {
    mockKeychain.set('session', 'left by the earlier install');
    const { authStorage } = launch();

    expect(await authStorage.getItem('session')).toBeNull();
    expect(mockFiles.has('installed')).toBe(true);
  });

  it('should read the session when the marker shows the same install', async () => {
    mockFiles.add('installed');
    mockKeychain.set('session', 'mine');
    const { authStorage } = launch();

    expect(await authStorage.getItem('session')).toBe('mine');
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('should delete a leftover once, even for reads that overlap', async () => {
    mockKeychain.set('session', 'left by the earlier install');
    const { authStorage } = launch();

    const reads = await Promise.all([authStorage.getItem('session'), authStorage.getItem('session')]);
    await authStorage.setItem('session', 'new');

    expect(reads).toEqual([null, null]);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(await authStorage.getItem('session')).toBe('new');
  });

  it('should try the deletion again after it failed, and read nothing left over', async () => {
    mockKeychain.set('session', 'left by the earlier install');
    const { authStorage } = launch();
    jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('Keychain busy'));

    await expect(authStorage.getItem('session')).rejects.toThrow('Keychain busy');
    expect(mockFiles.has('installed')).toBe(false);

    expect(await authStorage.getItem('session')).toBeNull();
    expect(mockFiles.has('installed')).toBe(true);
  });

  it('should open at once on a cold start in the foreground', async () => {
    const { storageReady } = launch('active');
    await expect(storageReady).resolves.toBeUndefined();
  });

  it('should not touch storage before the first foreground (iOS prewarming)', async () => {
    // Before the first unlock the marker reads as missing; checking it then would delete a valid
    // session.
    mockKeychain.set('session', 'mine');
    mockFiles.add('installed');
    const { authStorage, foreground } = launch('background');
    let read: string | null | undefined;
    void authStorage.getItem('session').then((value) => (read = value));

    await Promise.resolve();
    await Promise.resolve();
    expect(read).toBeUndefined();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();

    foreground();

    await expect(authStorage.getItem('session')).resolves.toBe('mine');
    expect(read).toBe('mine');
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
