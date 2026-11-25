import { describe, it, expect } from 'vitest'
import { stepZoom, ZOOM_STEPS } from './previewZoom'

describe('preview zoom steps', () => {
  it('moves to the neighbouring step and stops at the ends', () => {
    expect(stepZoom(100, 1)).toBe(110)
    expect(stepZoom(100, -1)).toBe(90)
    expect(stepZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1], 1)).toBe(200)
    expect(stepZoom(ZOOM_STEPS[0], -1)).toBe(50)
  })
  it('snaps an off-step value to the next step in that direction', () => {
    expect(stepZoom(104, 1)).toBe(110)
    expect(stepZoom(104, -1)).toBe(100)
  })
})
