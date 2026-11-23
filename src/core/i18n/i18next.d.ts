import 'i18next';

import type en from '@/locales/en.json';
import type webEn from '@/locales/web/en.json';

// English is the source of truth for keys: unknown keys fail the type check.
declare module 'i18next' {
  interface CustomTypeOptions {
    // `web`: the ported PWA's copy, on the web only (port-pwa-web D5).
    resources: { translation: typeof en; web: typeof webEn };
  }
}
