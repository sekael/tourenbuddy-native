import 'i18next';

import type en from '@/locales/en.json';

// English is the source of truth for keys: unknown keys fail the type check.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
