import { useState } from 'react';

/**
 * Undo and redo over snapshots of some state (track-drawing "Undo, redo and delete in every drawing
 * step"): `record` before each change keeps the state it replaces and clears redo; `undo` and `redo`
 * hand a snapshot to `restore`. `current` reads the state as it is now.
 */
export function useHistory<T>(current: () => T, restore: (state: T) => void) {
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);
  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    record: () => {
      const now = current();
      setPast((p) => [...p, now]);
      setFuture([]);
    },
    undo: () => {
      const last = past.at(-1);
      if (last === undefined) return;
      const now = current();
      setPast((p) => p.slice(0, -1));
      setFuture((f) => [now, ...f]);
      restore(last);
    },
    redo: () => {
      const next = future[0];
      if (next === undefined) return;
      const now = current();
      setFuture((f) => f.slice(1));
      setPast((p) => [...p, now]);
      restore(next);
    },
  };
}
