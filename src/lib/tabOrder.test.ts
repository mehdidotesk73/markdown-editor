import { describe, it, expect } from 'vitest'
import { moveItem, dropIndex, slideOf } from './tabOrder'

describe('reordering tabs by dragging', () => {
  it('moves one item, leaving the rest in order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a'])
  })

  it('lands past every tab whose centre the dragged one has crossed', () => {
    const centres = [50, 150, 250, 350] // four 100px tabs
    expect(dropIndex(centres, 0, 60)).toBe(0) // barely moved
    expect(dropIndex(centres, 0, 160)).toBe(1) // crossed b's centre
    expect(dropIndex(centres, 0, 400)).toBe(3) // past the end
    expect(dropIndex(centres, 3, 140)).toBe(1) // dragged left over b's centre
    expect(dropIndex(centres, 3, 10)).toBe(0)
  })

  it('slides the passed tabs one slot to show the gap', () => {
    // a (0) dragged to slot 2: b and c slide left, d stays
    expect([0, 1, 2, 3].map((k) => slideOf(k, 0, 2))).toEqual([0, -1, -1, 0])
    // d (3) dragged to slot 1: b and c slide right, a stays
    expect([0, 1, 2, 3].map((k) => slideOf(k, 3, 1))).toEqual([0, 1, 1, 0])
    expect([0, 1, 2].map((k) => slideOf(k, 1, 1))).toEqual([0, 0, 0])
  })
})
