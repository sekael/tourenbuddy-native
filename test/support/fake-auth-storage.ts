/** Stands in for `@/core/auth/auth-storage` in every test (`test/setup.ts`): a map in memory. */
export const memory = new Map<string, string>();

export const authStorage = {
  getItem: jest.fn(async (key: string) => memory.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => void memory.set(key, value)),
  removeItem: jest.fn(async (key: string) => void memory.delete(key)),
};

let gate: Promise<void> = Promise.resolve();

/** Open at once, unless a test holds it as a prewarmed launch does. */
export const storageReady: PromiseLike<void> = { then: (done, failed) => gate.then(done, failed) };

/** Keeps storage closed, as before the first foreground of a prewarmed launch; returns the opener. */
export function holdStorage() {
  let open!: () => void;
  gate = new Promise((resolve) => (open = resolve));
  return () => {
    open();
    gate = Promise.resolve();
  };
}
