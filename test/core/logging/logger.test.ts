import { createLogger } from '@/core/logging/logger';

const g = globalThis as unknown as { __DEV__: boolean };

describe('createLogger', () => {
  const devFlag = g.__DEV__;

  afterEach(() => {
    g.__DEV__ = devFlag;
    jest.restoreAllMocks();
  });

  it('should drop debug and info in release builds', () => {
    g.__DEV__ = false;
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});

    const log = createLogger('test');
    log.debug('hidden');
    log.info('hidden');

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('should keep tagged errors and warnings in release builds', () => {
    g.__DEV__ = false;
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const log = createLogger('sync');
    log.error('failed', 42);
    log.warn('slow');

    expect(error).toHaveBeenCalledWith('[sync]', 'failed', 42);
    expect(warn).toHaveBeenCalledWith('[sync]', 'slow');
  });
});
