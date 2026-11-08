import { describe, expect, it } from 'vitest'
import {
  addTourWeight,
  buildSlices,
  createPieMarkerElement,
  cssFill,
  FALLBACK_COLOR,
  pieImageColors,
  pieImageId,
  tourColors,
} from '@/features/map/presentation/components/pie-marker'
import { TOUR_TYPE_COLORS } from '@/features/tours/data/models/tour-type'

const BLUE = TOUR_TYPE_COLORS.skitour
const RED = TOUR_TYPE_COLORS.hiking

describe('buildSlices', () => {
  it('should return empty array when total is 0', () => {
    expect(buildSlices({ [BLUE]: 0, [RED]: 0 }, 0)).toEqual([])
  })

  it('should return a single full-circle path for one colour', () => {
    const slices = buildSlices({ [RED]: 3 }, 3)
    expect(slices).toEqual([{ path: expect.stringContaining('a'), color: RED }])
  })

  it('should return one slice per colour with fractional weights', () => {
    expect(buildSlices({ [BLUE]: 1.5, [RED]: 0.5 }, 2).map(s => s.color)).toEqual([BLUE, RED])
  })
})

describe('tourColors', () => {
  it('should fall back to neutral for an untyped tour', () => {
    expect(tourColors([], TOUR_TYPE_COLORS)).toEqual([FALLBACK_COLOR])
  })

  it('should count types sharing a colour once', () => {
    expect(tourColors(['skitour', 'splitboarding'], TOUR_TYPE_COLORS)).toEqual([BLUE])
  })
})

describe('addTourWeight', () => {
  it('should weigh a two-colour tour half per colour so a mixed cluster stays per-tour', () => {
    const counts = {}
    addTourWeight(counts, [BLUE])
    addTourWeight(counts, [BLUE, RED])
    expect(counts).toEqual({ [BLUE]: 1.5, [RED]: 0.5 })
  })
})

describe('split marker ids and fills', () => {
  it('should not split a single colour', () => {
    expect(pieImageId([BLUE])).toBeNull()
    expect(cssFill([BLUE])).toBe(BLUE)
  })

  it('should round-trip the colours through the image id', () => {
    expect(pieImageColors(pieImageId([BLUE, RED])!)).toEqual([BLUE, RED])
  })

  it('should ignore image ids it does not own', () => {
    expect(pieImageColors('tour-check-icon')).toBeNull()
  })

  it('should split an HTML dot into equal conic slices', () => {
    expect(cssFill([BLUE, RED])).toBe(`conic-gradient(${BLUE} 0% 50%, ${RED} 50% 100%)`)
  })
})

describe('cluster done badge', () => {
  const badge = (el: HTMLElement) => el.querySelector<HTMLElement>('.cluster-done')!

  it('should hide while no member is done, count partial completion and show a bare check when all are', () => {
    const { element, update } = createPieMarkerElement({ '#DC2626': 3 }, 3)
    expect(badge(element).style.display).toBe('none')
    update({ '#DC2626': 3 }, 3, 1)
    expect(badge(element).style.display).toBe('flex')
    expect(badge(element).textContent).toBe('1')
    update({ '#DC2626': 3 }, 3, 3)
    expect(badge(element).textContent).toBe('')
    expect(badge(element).querySelector('svg')).not.toBeNull()
  })

  it('should leave the marker element\'s positioning to MapLibre', () => {
    // An inline `position` overrides the marker class's `absolute`: the cluster then stretches to
    // the map's width and is anchored off its spot.
    expect(createPieMarkerElement({ '#DC2626': 1 }, 1).element.style.position).toBe('')
  })
})
