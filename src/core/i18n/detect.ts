import { SUPPORTED_LOCALE_CODES } from './supported';

/**
 * First of the user's preferred language tags that matches a supported locale, exactly or by
 * base language (`de-AT` → `de-CH`); English otherwise.
 */
export function detectLocale(languages: readonly string[]): string {
  for (const lang of languages) {
    if (SUPPORTED_LOCALE_CODES.includes(lang)) return lang;

    const base = lang.split('-')[0];
    const match = SUPPORTED_LOCALE_CODES.find((code) => code.split('-')[0] === base);
    if (match) return match;
  }

  return 'en';
}
