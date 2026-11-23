import { AsYouType, type CountryCode } from 'libphonenumber-js/min';
import { useLayoutEffect, useRef, type ChangeEvent } from 'react';

/** Digits and the leading '+': the characters the caret is tracked by. */
const significant = (s: string) => [...s].filter((ch) => /\d/.test(ch) || ch === '+').length;

function cursorAfter(s: string, n: number): number {
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (/\d/.test(s[i]!) || s[i] === '+') {
      count++;
      if (count === n) return i + 1;
    }
  }
  return s.length;
}

/**
 * The PWA's as-you-type phone formatting (libphonenumber, region CH): `raw` is what the user typed,
 * the field shows it formatted, and the caret stays after the same digit.
 */
export function useAsYouTypePhone(
  raw: string,
  setRaw: (value: string) => void,
  country: CountryCode = 'CH',
) {
  const formatted = raw ? new AsYouType(country).input(raw) : '';
  const pending = useRef<{ input: HTMLInputElement; digits: number } | null>(null);

  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const pos = cursorAfter(p.input.value, p.digits);
    p.input.setSelectionRange(pos, pos);
  });

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const cursor = input.selectionStart ?? input.value.length;
    pending.current = { input, digits: significant(input.value.slice(0, cursor)) };
    setRaw(input.value);
  };

  return { formatted, onInput };
}
