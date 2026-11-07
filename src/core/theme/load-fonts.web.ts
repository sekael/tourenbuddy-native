import { FontDisplay, loadAsync } from 'expo-font';

import { createLogger } from '@/core/logging/logger';

const log = createLogger('fonts');

// Latin subset of the Inter variable font: 48 KB for every weight, served from the app's own
// origin. FALLBACK shows the system stack after a moment and never swaps in late on a slow link.
loadAsync([
  {
    fontFamily: 'Inter',
    fontDefinitions: [
      {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles assets via require
        path: require('../../../assets/fonts/inter-latin-variable.woff2'),
        weight: '100 900',
        style: 'normal',
        display: FontDisplay.FALLBACK,
      },
    ],
  },
]).catch((error) => log.warn('Inter failed to load; using the system font', error));
