import fs from 'node:fs';
import path from 'node:path';

const app = path.join(__dirname, '../../src/app');

describe('routes', () => {
  // Every platform bundles every file under `src/app`: Expo Router 58's route context skips no
  // platform files, so a `map.web.tsx` route shipped the whole web port into the iOS bundle,
  // where Hermes failed on pdfjs. A route that differs re-exports `src/routes/<path>`, whose
  // `.tsx` and `.web.tsx` Metro picks per platform.
  it('should keep platform files out of src/app', () => {
    const offenders = (fs.readdirSync(app, { recursive: true }) as string[]).filter((file) =>
      /\.(web|ios|android|native)\.[jt]sx?$/.test(file),
    );

    expect(offenders).toEqual([]);
  });
});
