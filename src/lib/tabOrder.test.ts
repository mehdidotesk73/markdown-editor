import { describe, it, expect } from 'vitest'
import { moveItem, dropIndex, slideOf } from './tabOrder'

describe('reordering tabs by dragging', () => {
  it('moves one item, leaving the rest in order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a'])
  })

  it("swaps once the gap behind the dragged tab is wider than what's left showing of the next one", () => {
    // Tabs: X 200px wide at 0–200, Y 100px at 200–300, Z 100px at 300–400 (centres 100, 250, 350).
    const centres = [100, 250, 350]
    const at = (d: number) => dropIndex(centres, 0, 0 + d, 200 + d) // X dragged right by d
    expect(at(49)).toBe(0) // gap 49 < Y showing 51
    expect(at(51)).toBe(1) // gap 51 > Y showing 49: swap — X's width doesn't matter
    expect(at(149)).toBe(1)
    expect(at(151)).toBe(2) // and past Z's middle
    // Z dragged left: its left edge passes Y's middle (250), then X's (100).
    const zAt = (d: number) => dropIndex(centres, 2, 300 - d, 400 - d)
    expect(zAt(49)).toBe(2)
    expect(zAt(51)).toBe(1)
    expect(zAt(201)).toBe(0)
  })

  it('slides the passed tabs one slot to show the gap', () => {
    // a (0) dragged to slot 2: b and c slide left, d stays
    expect([0, 1, 2, 3].map((k) => slideOf(k, 0, 2))).toEqual([0, -1, -1, 0])
    // d (3) dragged to slot 1: b and c slide right, a stays
    expect([0, 1, 2, 3].map((k) => slideOf(k, 3, 1))).toEqual([0, 1, 1, 0])
    expect([0, 1, 2].map((k) => slideOf(k, 1, 1))).toEqual([0, 0, 0])
  })
})
