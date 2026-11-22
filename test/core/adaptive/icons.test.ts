import { icons } from '@/core/adaptive/icons';

describe('icon registry', () => {
  it.each(Object.entries(icons))('should give %s an SF Symbol and a drawable path', (_, icon) => {
    expect(icon.sf).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)*$/);
    if ('svg' in icon) {
      // The app's glyphs inherit the text colour; a fixed fill would ignore the theme.
      expect(icon.svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
      expect(icon.svg).toContain('currentColor');
      expect(icon.svg).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      return;
    }
    // A path pasted with its markup (`<path d="…"/>`) or a stray quote would draw nothing.
    expect(icon.md).toMatch(/^[Mm][MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
  });
});
