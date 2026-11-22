/** Vitest's `stubGlobal` / `unstubAllGlobals`, for the tests ported from the PWA. */
const originals = new Map<string, unknown>();
const scope = globalThis as unknown as Record<string, unknown>;

export function stubGlobal(name: string, value: unknown): void {
  if (!originals.has(name)) originals.set(name, scope[name]);
  scope[name] = value;
}

export function unstubAllGlobals(): void {
  for (const [name, value] of originals) scope[name] = value;
  originals.clear();
}
