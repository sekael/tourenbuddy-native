import { useNativeState } from '@expo/ui/swift-ui';
import { useCallback, useEffect, useRef } from 'react';

/** How many of the field's own reports count as echoes: far more than typing gets ahead. */
const ECHOES = 20;

/**
 * A SwiftUI field's text kept in step with a controlled `value` (iOS). The field reports each
 * keystroke and the value comes back a render later, often behind: writing that back would drop
 * what was typed since ("Wanderung" became "Warng"). So a value the field itself reported is never
 * written back; one from elsewhere (a lookup, a reset) is.
 * ponytail: a reset to a text still waiting for its echo is taken for that echo; none does that.
 */
export function useFieldText(
  value: string,
  onChange: ((text: string) => void) | undefined,
  /** The text was cleared from elsewhere (a search result taken, a reset). */
  onCleared?: () => void,
) {
  const text = useNativeState(value);
  const reported = useRef<string[]>([]);
  useEffect(() => {
    // Echoes come back in order: one answers its report and every report before it.
    const echo = reported.current.indexOf(value);
    if (echo >= 0) {
      reported.current = reported.current.slice(echo + 1);
      return;
    }
    if (text.get() === value) return;
    reported.current = [];
    text.set(value);
    if (!value) onCleared?.();
    // The value alone: a new callback is no new text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
