import fs from 'node:fs';
import path from 'node:path';

const src = path.join(__dirname, '../../../src');

describe('web styles', () => {
  // Metro's dev server (`npm run web`) drops a CSS `@import` that the export inlines: the theme's
  // tokens went missing in development only. Import style sheets from JS instead.
  it('should not use @import in any style sheet', () => {
    const offenders = (fs.readdirSync(src, { recursive: true }) as string[])
      .filter((file) => file.endsWith('.css'))
      .filter((file) => /^\s*@import\b/m.test(fs.readFileSync(path.join(src, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
