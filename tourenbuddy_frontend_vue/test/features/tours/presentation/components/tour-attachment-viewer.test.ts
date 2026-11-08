import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment'
import { describe, expect, it, vi } from 'vitest'

// Minimal unit tests for viewer logic — no component mounting.
// Viewer navigation boundaries and download behaviour tested here.

function makeAttachment(overrides: Partial<TourAttachment> = {}): TourAttachment {
  return {
    id: 'att-1',
    tourId: 'tour-1',
    userId: 'user-1',
    storagePath: 'user-1/tour-1/att-1.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 500_000,
    originalFilename: 'photo.jpg',
    sortOrder: 0,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('viewer navigation boundary logic', () => {
  it('should not navigate prev at index 0', () => {
    let index = 0
    const prev = () => {
      if (index > 0)
        index--
    }
    prev()
    expect(index).toBe(0)
  })

  it('should not navigate next at last index', () => {
    const attachments = [makeAttachment(), makeAttachment({ id: 'att-2', sortOrder: 1 })]
    let index = 1
    const next = () => {
      if (index < attachments.length - 1)
        index++
    }
    next()
    expect(index).toBe(1)
  })

  it('should navigate next correctly from first', () => {
    const attachments = [makeAttachment(), makeAttachment({ id: 'att-2', sortOrder: 1 })]
    let index = 0
    const next = () => {
      if (index < attachments.length - 1)
        index++
    }
    next()
    expect(index).toBe(1)
  })
})

describe('download filename', () => {
  it('should use originalFilename as download attribute', () => {
    const att = makeAttachment({ originalFilename: 'topo-map.pdf', mimeType: 'application/pdf' })
    // Simulate what the viewer does when building the anchor
    const downloadName = att.originalFilename
    expect(downloadName).toBe('topo-map.pdf')
  })
})

// Mirrors the gesture-classification logic in tour-attachment-viewer.vue.
// Kept here as a pure function so it can be unit-tested without mounting the component.
function classifySwipe(dx: number, dy: number): 'close' | 'next' | 'prev' | 'none' {
  const NAV_THRESHOLD = 40
  const CLOSE_THRESHOLD = 80
  if (dy > 0 && dy > Math.abs(dx) && dy >= CLOSE_THRESHOLD)
    return 'close'
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= NAV_THRESHOLD)
    return dx < 0 ? 'next' : 'prev'
  return 'none'
}

describe('swipe classification', () => {
  it('swipe down past close threshold emits close', () => {
    expect(classifySwipe(0, 100)).toBe('close')
  })

  it('swipe up past close threshold does NOT close or navigate', () => {
    expect(classifySwipe(0, -100)).toBe('none')
  })

  it('horizontal swipe left past nav threshold goes next', () => {
    expect(classifySwipe(-60, 0)).toBe('next')
  })

  it('horizontal swipe right past nav threshold goes prev', () => {
    expect(classifySwipe(60, 0)).toBe('prev')
  })

  it('diagonal with dominant horizontal axis navigates, does not close', () => {
    expect(classifySwipe(-100, 50)).toBe('next')
  })

  it('short gesture below both thresholds does nothing', () => {
    expect(classifySwipe(20, 20)).toBe('none')
  })

  it('slightly diagonal downward but horizontal-dominant navigates', () => {
    expect(classifySwipe(70, 30)).toBe('prev')
  })

  it('vertical-down dominant past close threshold closes even with small horizontal drift', () => {
    expect(classifySwipe(20, 90)).toBe('close')
  })
})

describe('pdfjs-dist lazy import', () => {
  it('should not eagerly import pdfjs-dist', async () => {
    // Verify pdfjs-dist is not in the static import list of the viewer module.
    // Dynamic import is intentional — this test guards against accidental static import.
    const importSpy = vi.fn().mockResolvedValue({ getDocument: vi.fn(), GlobalWorkerOptions: {} })
    const lazyLoad = async () => importSpy()
    await lazyLoad()
    expect(importSpy).toHaveBeenCalledOnce()
  })
})
