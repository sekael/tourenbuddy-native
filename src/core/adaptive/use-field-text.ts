import { useNativeState } from '@expo/ui/swift-ui';
import { useCallback, useEffect, useRef } from 'react';

/** How many of the field's own reports count as echoes: far more than typing gets ahead. */
const ECHOES = 20;

/**
 * A SwiftUI field's text kept in step with a controlled `value` (iOS). The field reports each
 * keystroke and the value comes back a render later, often behind: writing that back would drop
 * what was typed since ("Wanderung" became "Warng"). So a value the field itself reported is never
 * written back; one from elsewhere (a lookup, a reset) is.
 * ponytail: a reset to a text the user typed moments ago is taken for an echo; none does that.
 */
export function useFieldText(value: string, onChange: ((text: string) => void) | undefined) {
  const text = useNativeState(value);
  const reported = useRef<string[]>([]);
  useEffect(() => {
    if (reported.current.includes(value) || text.get() === value) return;
    reported.current = [];
    text.set(value);
  }, [text, value]);
  const onTextChange = useCallback(
    (next: string) => {
      reported.current = [...reported.current.slice(1 - ECHOES), next];
      onChange?.(next);
    },
    [onChange],
  );
  return { text, onTextChange };
}
