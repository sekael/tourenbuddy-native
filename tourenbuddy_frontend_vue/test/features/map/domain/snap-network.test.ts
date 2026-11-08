import { describe, expect, it } from 'vitest'
import { snapNetworkFor } from '@/features/map/domain/snap-network'

describe('snapNetworkFor', () => {
  it('should draw straight with no trail layer shown, whatever the activity', () => {
    expect(snapNetworkFor([], ['skitour'])).toBeNull()
  })

  it('should follow the one layer shown even against the activity', () => {
    expect(snapNetworkFor(['ski'], ['hiking'])).toBe('ski')
    expect(snapNetworkFor(['hiking'], ['skitour'])).toBe('hiking')
  })

  it('should let hiking win with both layers when hiking and ski touring are both picked, or neither', () => {
    expect(snapNetworkFor(['hiking', 'ski'], ['skitour', 'hiking'])).toBe('hiking')
    expect(snapNetworkFor(['hiking', 'ski'], [])).toBe('hiking')
    expect(snapNetworkFor(['hiking', 'ski'], ['splitboarding', 'mountaineering'])).toBe('ski')
  })
})
