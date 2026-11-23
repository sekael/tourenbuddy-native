import { useReducer, useState } from 'react';

/**
 * Vue-style reactive state for components ported line by line from the PWA (D3): fields read and
 * written synchronously like Vue refs, every write re-renders. Only in components that opt out of
 * the React Compiler (`'use no memo'`), whose memoization assumes state is never mutated.
 */
export function useReactive<T extends object>(init: () => T): T {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [state] = useState(
    () =>
      new Proxy(init(), {
        set(target, key, value) {
          if (!Object.is(Reflect.get(target, key), value)) {
            Reflect.set(target, key, value);
            rerender();
          }
          return true;
        },
      }),
  );
  return state;
}
