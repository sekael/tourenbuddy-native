import { describe, expect, it } from 'vitest'
import { formatBytes } from '@/core/utils/format-bytes'

describe('formatBytes', () => {
  it('keeps bytes below 1 KiB as whole bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('shows one decimal below 10 of a unit, none at/above', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(11 * 1024)).toBe('11 KB')
  })

  it('climbs units and caps at TB', () => {
    expect(formatBytes(3.25 * 1024 ** 3)).toBe('3.3 GB')
    expect(formatBytes(5 * 1024 ** 4)).toBe('5 TB')
  })
})
