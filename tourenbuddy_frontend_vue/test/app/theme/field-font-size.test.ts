import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// iOS zooms the page into a focused field under 16px and leaves it zoomed. A field's
// own rule must never shrink it below the 1rem floor in global.css.
const SRC = join(__dirname, '../../../src')

describe('form fields', () => {
  it('should never set a field font-size below 16px', () => {
    const offenders = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter(file => file.endsWith('.vue'))
      .flatMap((file) => {
        const style = readFileSync(join(SRC, file), 'utf8').split('<style')[1] ?? ''
        return [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
          .filter(([, selector, body]) =>
            /\b(?:input|textarea|select)\b|-input\b|\.input/.test(selector.trim().split('\n').at(-1)!)
            && /font-size:\s*var\(--font-size-(?:xs|sm)\)/.test(body))
          .map(([, selector]) => `${file}: ${selector.trim()}`)
      })
    expect(offenders).toEqual([])
  })
})
