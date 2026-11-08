import { Color, createExpression } from '@maplibre/maplibre-gl-style-spec'
import { describe, expect, it } from 'vitest'
import { gradeColor, gradeColorExpression } from '@/features/map/presentation/components/ski-badge'

function haloColor(properties: Record<string, unknown>): string {
  const expression = createExpression(gradeColorExpression(), { type: 'color' } as never)
  if (expression.result !== 'success')
    throw new Error('invalid expression')
  return (expression.value.evaluate({ zoom: 12 }, { properties } as never) as Color).toString()
}

const rgba = (hex: string) => Color.parse(hex)!.toString()

describe('gradeColorExpression', () => {
  // Halo (MapLibre expression) and badge (canvas, gradeColor) must agree, or a route's
  // glow and its badge show different difficulty colors.
  it('should match gradeColor for every grade, modifiers and clamped ends included', () => {
    for (let grade = 0; grade <= 20; grade++) {
      const [r, g, b] = haloColor({ grade }).match(/\d+/g)!.map(Number)
      const [er, eg, eb] = rgba(gradeColor(grade)).match(/\d+/g)!.map(Number)
      // gradeColor rounds each channel; MapLibre keeps fractions until rendering.
      expect(Math.abs(r! - er!) + Math.abs(g! - eg!) + Math.abs(b! - eb!)).toBeLessThanOrEqual(3)
    }
  })

  it('should be grey when the feature has no grade', () => {
    expect(haloColor({})).toBe(rgba(gradeColor(null)))
  })
})
