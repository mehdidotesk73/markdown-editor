import { describe, it, expect } from 'vitest'
import { dentPath, labelSink, Spring } from './liquidTabs'

describe('liquid tab bar', () => {
  const base = { width: 600, height: 42, center: 300, halfWidth: 50, depth: 24 }

  it('draws a closed pill whose top edge dips to the dent floor', () => {
    const d = dentPath(base)
    expect(d.startsWith('M21,0')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    // floor runs at the requested depth around the centre
    expect(d).toMatch(/L\d+(\.\d)?,24 /)
  })

  it('keeps the dent inside the straight top edge near the ends', () => {
    const d = dentPath({ ...base, center: 10 })
    const firstShoulder = Number(/L([\d.]+),0/.exec(d)![1])
    expect(firstShoulder).toBeGreaterThanOrEqual(21) // never inside the rounded end
  })

  it('draws nothing for a bar too small to have a straight edge', () => {
    expect(dentPath({ ...base, width: 30 })).toBe('')
  })

  it('sinks a label fully under the bubble and not at all once clear of it', () => {
    expect(labelSink(100, 80, 100, 90)).toBe(1)
    expect(labelSink(100, 80, 300, 90)).toBe(0)
    const half = labelSink(100, 80, 140, 90)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)
  })

  it('sinks less the further the bubble is', () => {
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
