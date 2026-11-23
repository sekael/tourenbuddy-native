// The PWA's key: a PWA user's choice carries over on the same origin.
const KEY = 'tb.locale';

/** The language picked in the app (Profile), in this browser; none: the browser's languages. */
export function readLanguageChoice(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeLanguageChoice(code: string): void {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    // Private mode: the choice lasts until the page reloads.
  }
}
