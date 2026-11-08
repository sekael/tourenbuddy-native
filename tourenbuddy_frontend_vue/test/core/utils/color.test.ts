import { describe, expect, it } from 'vitest'
import { darkenHex } from '@/core/utils/color'

function hexToLightness(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}

describe('darkenHex', () => {
  it('should return a darker color (lower lightness)', () => {
    const original = '#1565C0'
    const darkened = darkenHex(original, 18)
    expect(hexToLightness(darkened)).toBeLessThan(hexToLightness(original))
  })

  it('should darken red', () => {
    const original = '#DC2626'
    const darkened = darkenHex(original, 18)
    expect(hexToLightness(darkened)).toBeLessThan(hexToLightness(original))
  })

  it('should darken amber', () => {
    const original = '#D97706'
    const darkened = darkenHex(original, 18)
    expect(hexToLightness(darkened)).toBeLessThan(hexToLightness(original))
  })

  it('should return valid hex string', () => {
    const result = darkenHex('#FF0000', 10)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('should clamp lightness to 0 when percent exceeds lightness', () => {
    const result = darkenHex('#111111', 80)
    expect(hexToLightness(result)).toBeLessThanOrEqual(0.01)
  })
})
