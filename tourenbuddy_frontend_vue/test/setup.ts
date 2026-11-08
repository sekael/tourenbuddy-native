import { vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (values && Object.keys(values).length > 0) {
        return Object.entries(values).reduce((str, [k, v]) => str.replace(`{${k}}`, String(v)), key)
      }
      return key
    },
    locale: { value: 'en' },
  }),
  createI18n: vi.fn(() => ({ install: vi.fn() })),
}))
