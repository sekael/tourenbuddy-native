export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const noop = () => {};

/**
 * Tagged logger, the only place allowed to call the console (lint enforces it).
 * Release builds drop `debug` and `info`. A plain function, not a hook, so data-layer
 * modules can create one at module level.
 */
export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    debug: __DEV__ ? (...args) => console.debug(prefix, ...args) : noop,
    info: __DEV__ ? (...args) => console.info(prefix, ...args) : noop,
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}
