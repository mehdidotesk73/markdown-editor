import { describe, it, expect } from 'vitest'
import { clampZoom, DEFAULT_ZOOM } from './previewZoom'

describe('preview zoom', () => {
  it('keeps a stored zoom on a step and within range', () => {
    expect(clampZoom(125)).toBe(125)
    expect(clampZoom(67)).toBe(65)
    expect(clampZoom(20)).toBe(50)
    expect(clampZoom(400)).toBe(200)
    expect(clampZoom(NaN)).toBe(DEFAULT_ZOOM)
  })
})
