import { describe, it, expect } from 'vitest'
import { dentGeometry, dentPath, dentSpread, labelSink, Spring } from './liquidTabs'

describe('liquid tab bar', () => {
  const base = { width: 600, height: 48, center: 300, bubbleWidth: 120, bubbleHeight: 36, bubbleCenterY: -4, gap: 5 }

  it('draws a closed pill whose top edge flows down into a valley and back', () => {
    const d = dentPath(base)
    expect(d.startsWith('M24,0')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    // floor sits gap below the bubble's bottom: -4 + 18 + 5
    expect(d).toContain(',19 L')
    // smooth S-curves, no arcs, inside the valley
    expect((d.match(/C/g) ?? []).length).toBe(2)
    expect(d.indexOf('A')).toBeGreaterThan(d.lastIndexOf('C')) // arcs only at the bar's ends
  })

  it('keeps the bubble clear of the valley all the way along', () => {
    const g = dentGeometry(base)
    const c = base.center
    // left S-curve as a cubic Bézier, sampled
    const a = c - g.flat - g.side
    const b = c - g.flat
    const m = g.side / 2
    const P = [[a, 0], [a + m, 0], [b - m, g.depth], [b, g.depth]]
    // the bubble's left round end: circle at (b, cy) radius R
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const u = 1 - t
      const x = u ** 3 * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t ** 3 * P[3][0]
      const y = u ** 3 * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t ** 3 * P[3][1]
      const dist = Math.hypot(x - b, y - base.bubbleCenterY) - g.R
      expect(dist).toBeGreaterThan(base.gap * 0.5)
    }
  })

  it('reports how far the valley reaches past the bubble, for spacing tabs', () => {
    const s = dentSpread(base)
    expect(s).toBeGreaterThan(base.gap)
    expect(s).toBeLessThan(30)
  })

  it('keeps the valley off the rounded ends of the bar', () => {
    const d = dentPath({ ...base, center: 10 })
    const start = Number(/L([\d.]+),0/.exec(d)![1])
    expect(start).toBeGreaterThanOrEqual(24)
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
