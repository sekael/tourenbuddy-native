import { describe, expect, it } from 'vitest'
import { feedUrlSchema } from '@/features/calendar/data/models/calendar-feed'

describe('feedUrlSchema', () => {
  it('should normalize webcal:// case-insensitively and trim whitespace', () => {
    expect(feedUrlSchema.parse('  WEBCAL://p01-caldav.icloud.com/published/2/abc ')).toBe('https://p01-caldav.icloud.com/published/2/abc')
  })

  it('should reject http://, other schemes and non-URLs', () => {
    for (const bad of ['http://cal.example/a.ics', 'ftp://cal.example/a.ics', 'cal.example/a.ics', ''])
      expect(feedUrlSchema.safeParse(bad).success).toBe(false)
  })

  it('should reject Google embed links but accept Google iCal addresses', () => {
    const embed = feedUrlSchema.safeParse('https://calendar.google.com/calendar/embed?src=a%40ipt.ch&ctz=Europe%2FZurich')
    expect(embed.error?.issues[0].message).toBe('not_ical')
    expect(feedUrlSchema.safeParse('https://calendar.google.com/calendar/ical/a%40ipt.ch/private-abc/basic.ics').success).toBe(true)
  })
})
