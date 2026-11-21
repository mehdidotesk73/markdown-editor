import { describe, it, expect } from 'vitest'
import { cleanAnchors, editorLineAt, editorTopOf, previewLineAt, previewTopOf, scrollFor, edgeOf, segmentAtLine, segmentAtTop, wordFractionAt, wordMiddleAt, isWord } from './scrollSync'

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

  it('matches by word within a block: the 70th of 100 words → 70% of the rendered words', () => {
    // Editor: 100 words, 10 per row of 20px (one long source line, wrapped).
    const ed = Array.from({ length: 100 }, (_, i) => ({ top: Math.floor(i / 10) * 20, bottom: Math.floor(i / 10) * 20 + 20 }))
    const p = wordFractionAt(ed, 145)! // row 7 → its first word, the 71st
    expect(p).toBeCloseTo(70.5 / 100)
    // Preview: the same block wraps 8 words per row of 30px (120 words after rendering).
    const pv = Array.from({ length: 120 }, (_, i) => ({ top: 1000 + Math.floor(i / 8) * 30, bottom: 1000 + Math.floor(i / 8) * 30 + 30 }))
    expect(wordMiddleAt(pv, p)).toBe(1000 + Math.floor(84 / 8) * 30 + 15) // word 84 of 120 → its row's middle
    expect(wordFractionAt([], 10)).toBeNull()
    expect(wordMiddleAt([], 0.5)).toBeNull()
  })

  it('finds the block holding a line or a height; keeps the innermost block per line', () => {
    const anchors = cleanAnchors(
      [
        { line: 2, top: 50, depth: 1, el: 'li' },
        { line: 2, top: 50, depth: 2, el: 'p' },
        { line: 6, top: 200, el: 'pre' },
      ],
      9,
      300,
    )
    expect(anchors.map((a) => a.el ?? '·')).toEqual(['·', 'p', 'pre', '·'])
    expect(segmentAtLine(anchors, 4.5)).toBe(1)
    expect(segmentAtTop(anchors, 250)).toBe(2)
    expect(['**', '-', '|', 'word', '42', 'é'].map(isWord)).toEqual([false, false, false, true, true, true])
  })
})
