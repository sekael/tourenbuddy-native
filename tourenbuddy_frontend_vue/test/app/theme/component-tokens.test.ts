import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A var() naming an undefined custom property resolves to the property's initial
// value (`transparent`, `0`, `none` …) — the element silently loses its styling
// instead of failing. Every referenced token must be defined somewhere: a theme
// file, a scoped `--x:` declaration, or a `'--x'` key set from a template/script.
// Read through fs: Vitest serves `.css?raw` imports as empty strings.
const SRC = join(__dirname, '../../../src')
const sources = Object.fromEntries(
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter(file => /\.(?:vue|css|ts)$/.test(file))
    .map(file => [file, readFileSync(join(SRC, file), 'utf8')]),
)

describe('design tokens', () => {
  it('should never reference an undefined custom property', () => {
    const all = Object.values(sources).join('\n')
    expect(all).toContain('--color-primary:')
    const defined = new Set([
      ...[...all.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]),
      ...[...all.matchAll(/['"](--[\w-]+)['"]/g)].map(m => m[1]),
    ])
    const undefinedRefs = Object.entries(sources).flatMap(([file, source]) =>
      [...source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
        .filter(m => !defined.has(m[1]))
        .map(m => `${file}: ${m[1]}`),
    )
    expect(undefinedRefs).toEqual([])
  })
})
