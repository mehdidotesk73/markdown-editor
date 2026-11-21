import { describe, it, expect } from 'vitest'
import { cleanAnchors, editorLineAt, editorTopOf, previewLineAt, previewTopOf, scrollFor, edgeOf } from './scrollSync'

describe('scroll sync by content', () => {
  // Editor: 10 lines of 20px, but line 3 wraps to 3 rows (60px).
  const tops = [0, 20, 40, 60, 120, 140, 160, 180, 200, 220]
  const editorHeight = 240

  it('maps editor heights to source lines and back, wrapped lines included', () => {
    expect(editorLineAt(tops, 0, editorHeight)).toBe(0)
    expect(editorLineAt(tops, 90, editorHeight)).toBe(3.5) // halfway down the wrapped line
    expect(editorLineAt(tops, 130, editorHeight)).toBe(4.5)
    expect(editorTopOf(tops, 3.5, editorHeight)).toBe(90)
    expect(editorTopOf(tops, 10, editorHeight)).toBe(240)
  })

  it('spreads lines evenly between preview blocks, so a tall block takes its lines', () => {
    // A heading on line 0, a 600px diagram from line 2 to 6, a paragraph on line 7.
    const anchors = cleanAnchors(
      [
        { line: 0, top: 0 },
        { line: 2, top: 50 },
        { line: 7, top: 650 },
      ],
      10,
      700,
    )
    expect(previewTopOf(anchors, 2)).toBe(50)
    expect(previewTopOf(anchors, 4.5)).toBe(350) // the middle of the diagram's lines → the middle of the diagram
    expect(previewLineAt(anchors, 350)).toBe(4.5)
    expect(previewTopOf(anchors, 10)).toBe(700) // the end of the document
  })

  it('keeps anchors in order: first block per line, never going back up', () => {
    const anchors = cleanAnchors(
      [
        { line: 5, top: 300 },
        { line: 3, top: 100 },
        { line: 3, top: 140 }, // a nested block on the same line
        { line: 4, top: 90 }, // above line 3's block: skipped
      ],
      6,
      400,
    )
    expect(anchors).toEqual([
      { line: 0, top: 0 },
      { line: 3, top: 100 },
      { line: 5, top: 300 },
      { line: 6, top: 400 },
    ])
  })

  it('centres the target, but pins both panes together at the top and the bottom', () => {
    expect(scrollFor(500, 400, 2000, 'middle')).toBe(300)
    expect(scrollFor(100, 400, 2000, 'middle')).toBe(0)
    expect(scrollFor(1950, 400, 2000, 'middle')).toBe(1600)
    expect(scrollFor(800, 400, 2000, 'top')).toBe(0)
    expect(scrollFor(800, 400, 2000, 'bottom')).toBe(1600)
    expect(edgeOf(0, 400, 2000)).toBe('top')
    expect(edgeOf(1600, 400, 2000)).toBe('bottom')
    expect(edgeOf(700, 400, 2000)).toBe('middle')
  })
})
