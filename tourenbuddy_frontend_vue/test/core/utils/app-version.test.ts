import { describe, expect, it } from 'vitest'
import { appVersionLabel } from '@/core/utils/app-version'
import pkg from '../../../package.json'

describe('appVersionLabel', () => {
  it('should inject the package.json version at build time', () => {
    expect(__APP_VERSION__).toBe(pkg.version)
  })

  it('should show the version only on a production build', () => {
    expect(appVersionLabel('0.44.0', undefined, false)).toBe('0.44.0')
  })

  it('should append the short commit on a preview build even in dev mode', () => {
    expect(appVersionLabel('0.44.0', '1a2b3c4d5e6f', true)).toBe('0.44.0 · 1a2b3c4')
  })

  it('should mark a local build as dev', () => {
    expect(appVersionLabel('0.44.0', undefined, true)).toBe('0.44.0 · dev')
  })
})
