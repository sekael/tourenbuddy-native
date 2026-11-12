import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';

/** Escape runs the page's leading action (back, close, cancel) while its route is on top. */
export function useEscape(onEscape: (() => void) | undefined) {
  const focused = useIsFocused();
  const run = useEffectEvent(() => onEscape?.());
  const active = focused && !!onEscape;

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && run();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
