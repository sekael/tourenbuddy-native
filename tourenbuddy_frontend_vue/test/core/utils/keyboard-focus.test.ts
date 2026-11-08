import { describe, expect, it } from 'vitest'
import { focusForKeyboard } from '@/core/utils/keyboard-focus'

describe('focusForKeyboard', () => {
  it('should not focus after a tap, so touch never shows a focus ring', () => {
    const btn = document.body.appendChild(document.createElement('button'))
    window.dispatchEvent(new Event('pointerdown'))
    focusForKeyboard(btn)
    expect(document.activeElement).not.toBe(btn)
  })

  it('should focus after a key press', () => {
    const btn = document.body.appendChild(document.createElement('button'))
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    focusForKeyboard(btn)
    expect(document.activeElement).toBe(btn)
  })
})
