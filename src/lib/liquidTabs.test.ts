import { describe, it, expect } from 'vitest'
import { dentPath, dentSpread, labelSink, Spring } from './liquidTabs'

describe('liquid tab bar', () => {
  const base = { width: 600, height: 46, center: 300, bubbleWidth: 120, bubbleHeight: 36, bubbleCenterY: -6, gap: 5 }

  it('draws a closed pill whose top edge dips around the bubble', () => {
    const d = dentPath(base)
    expect(d.startsWith('M23,0')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    // the floor runs under the bubble at centre + radius + gap = -6 + 18 + 5
    expect(d).toContain(',17 L')
  })

  it('hugs the bubble: the floor spans its flat bottom, the arcs its round ends', () => {
    const d = dentPath(base)
    // bubble 120 wide with radius 18 → round-end centres at 258 and 342
    expect(d).toContain('258,17 L342,17')
    expect(d).toContain('A23,23 0 0 0') // arcs of radius 18 + 5 around each end
  })

  it('reports how far the dent spreads past the bubble, for spacing tabs', () => {
    const s = dentSpread(base)
    expect(s).toBeGreaterThan(base.gap) // wider than the gap alone: the lip rolls out too
    expect(s).toBeLessThan(25)
  })

  it('keeps the dent off the rounded ends of the bar', () => {
    const d = dentPath({ ...base, center: 10 })
    const lipStart = Number(/L([\d.]+),0/.exec(d)![1])
    expect(lipStart).toBeGreaterThanOrEqual(23)
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
