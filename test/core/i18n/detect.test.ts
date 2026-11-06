import { detectLocale } from '@/core/i18n/detect';

describe('detectLocale', () => {
  it('should prefer the first supported tag over later ones', () => {
    expect(detectLocale(['en', 'de-CH'])).toBe('en');
  });

  it('should fall back to de-CH for any German region', () => {
    expect(detectLocale(['de-AT'])).toBe('de-CH');
    expect(detectLocale(['de-DE'])).toBe('de-CH');
  });

  it('should map a bare language tag, as the per-app language "de" reports', () => {
    expect(detectLocale(['de'])).toBe('de-CH');
  });

  it('should check later tags when the first does not match', () => {
    expect(detectLocale(['ja', 'de-CH'])).toBe('de-CH');
  });

  it('should return en when no tag matches', () => {
    expect(detectLocale(['ja', 'zh-Hans-CN'])).toBe('en');
  });

  it('should return en for an empty list', () => {
    expect(detectLocale([])).toBe('en');
  });

  it('should not match on a shared prefix that is not the base language', () => {
    expect(detectLocale(['dsb-DE'])).toBe('en');
  });
});
