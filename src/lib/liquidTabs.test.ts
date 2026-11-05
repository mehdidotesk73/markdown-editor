import { describe, it, expect } from 'vitest'
import { labelSink, Spring } from './liquidTabs'

describe('liquid tab bar', () => {
  it('lights a tab fully under the well and not at all once clear of it', () => {
    expect(labelSink(100, 80, 100, 90)).toBe(1)
    expect(labelSink(100, 80, 300, 90)).toBe(0)
    const half = labelSink(100, 80, 140, 90)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)
  })

  it('lights less the further the well is', () => {
    const a = labelSink(100, 80, 110, 90)
    const b = labelSink(100, 80, 150, 90)
    expect(a).toBeGreaterThan(b)
  })

  it('springs to the target with a small overshoot, then settles exactly', () => {
    const s = new Spring(0)
    s.target = 100
    let peak = 0
    let settled = false
    for (let i = 0; i < 600 && !settled; i++) {
      settled = s.step(1 / 60)
      peak = Math.max(peak, s.value)
    }
    expect(settled).toBe(true)
    expect(s.value).toBe(100)
    expect(peak).toBeGreaterThan(100) // the liquid wobble
    expect(peak).toBeLessThan(115)
  })
})
