import i18n, { setAppLanguage } from '@/core/i18n';
import { readLanguageChoice } from '@/core/i18n/language-choice';

// The language picked in Profile (as the PWA's switch): applied at once and kept on the device,
// where the next launch reads it before the first frame.
it('should switch the app at once and keep the choice for the next launch', () => {
  setAppLanguage('en');
  expect(i18n.language).toBe('en');

  setAppLanguage('de-CH');

  expect(i18n.language).toBe('de-CH');
  expect(readLanguageChoice()).toBe('de-CH');
});
