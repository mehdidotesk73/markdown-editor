import { describe, it, expect } from 'vitest'
import { buildIndex, splitBlocks, wordCoord } from './segment'
import { bellAverage, focusSpan, FOCUS_SHARE } from './wave'
import { focalPoint } from './focal'
import { alignWords, mathRanges, previewRange } from './align'

const DOC = `# Intro

One two three. Four five six.

Seven eight nine ten.

## Next

- Item alpha beta
- Item gamma

\`\`\`js
const code = 1
\`\`\`
`

describe('segmentation', () => {
  const ix = buildIndex(DOC)

  it('splits blocks, keeping a fenced code block whole', () => {
    const blocks = splitBlocks(DOC).map((b) => DOC.slice(b.start, b.end))
    expect(blocks[0]).toBe('# Intro')
    expect(blocks).toContain('- Item alpha beta')
    expect(blocks.some((b) => b.startsWith('```js') && b.endsWith('```'))).toBe(true)
  })

  it('finds words, sentences, paragraphs and sections', () => {
    expect(ix.words.length).toBe(1 + 6 + 4 + 1 + 4 + 2 + 3) // headings and code words count too
    expect(ix.sentences.length).toBe(1 + 2 + 1 + 1 + 1 + 1 + 1)
    expect(ix.paragraphs.length).toBe(7)
    expect(ix.sections.length).toBe(2)
    expect(DOC.slice(ix.sentences.start[2], ix.sentences.end[2])).toBe('Four five six.')
  })

  it('places the cursor on the word ruler, fractionally inside a word', () => {
    const at = DOC.indexOf('five')
    expect(wordCoord(ix, at)).toBe(5)
    expect(wordCoord(ix, at + 2)).toBeCloseTo(5.5)
    expect(wordCoord(ix, 0)).toBe(0)
    expect(wordCoord(ix, DOC.length)).toBe(ix.words.length)
  })
})

describe('attention field and focus', () => {
  it('peaks at 1 at the focal point and averages lower over longer spans', () => {
    expect(bellAverage(4.999, 5.001, 5, 3)).toBeCloseTo(1, 3)
    const short = bellAverage(5, 8, 4, 3)
    const long = bellAverage(5, 20, 4, 3)
    expect(long).toBeLessThan(short)
  })

  it('is symmetric about the focal point', () => {
    expect(bellAverage(0, 2, 5, 3)).toBeCloseTo(bellAverage(8, 10, 5, 3), 6)
  })

  // Sentences start with a capital, as real ones do: sentence splitting (ICU) won't
  // break before a lowercase word, in case the full stop ends an abbreviation.
  const sentence = (n: number) => Array.from({ length: n }, (_, i) => (i ? `w${i}` : 'W0')).join(' ') + '.'
  const shortDoc = Array.from({ length: 40 }, () => sentence(4)).join(' ')
  const longDoc = Array.from({ length: 40 }, () => sentence(20)).join(' ')
  const count = (s: ReturnType<typeof focusSpan>) => s!.last - s!.first + 1

  it('holds 60% of the cumulative attention, and no unit more than it needs', () => {
    const ix = buildIndex(shortDoc)
    const x = ix.words.length / 2 + 0.5
    const sp = focusSpan(ix, 'sentence', x, 12)!
    expect(sp.share).toBeGreaterThanOrEqual(FOCUS_SHARE)
    // dropping the weakest unit at either end would fall short of 60%
    const total = sp.attention.reduce((a, b) => a + b, 0) / sp.share
    const weakest = Math.min(sp.attention[0], sp.attention[sp.attention.length - 1])
    expect(sp.attention.reduce((a, b) => a + b, 0) - weakest).toBeLessThan(FOCUS_SHARE * total)
  })

  it('on the word scale, covers about 1.7σ words (60% of a bell)', () => {
    const ix = buildIndex(shortDoc)
    const x = ix.words.length / 2 + 0.5
    for (const sigma of [3, 6, 12]) {
      const n = count(focusSpan(ix, 'word', x, sigma))
      expect(n).toBeGreaterThanOrEqual(Math.floor(1.6 * sigma))
      expect(n).toBeLessThanOrEqual(Math.ceil(1.9 * sigma) + 1)
    }
  })

  it('holds fewer long sentences than short ones at the same decay', () => {
    const s = buildIndex(shortDoc)
    const l = buildIndex(longDoc)
    const nS = count(focusSpan(s, 'sentence', s.words.length / 2 + 0.5, 15))
    const nL = count(focusSpan(l, 'sentence', l.words.length / 2 + 0.5, 15))
    expect(nS).toBeGreaterThan(nL)
  })

  it('grows as the decay length rises', () => {
    const ix = buildIndex(shortDoc)
    const x = ix.words.length / 2 + 0.5
    let prev = 0
    for (const sigma of [2, 6, 12, 24]) {
      const n = count(focusSpan(ix, 'sentence', x, sigma))
      expect(n).toBeGreaterThanOrEqual(prev)
      prev = n
    }
    expect(prev).toBeGreaterThan(5)
  })

  it('always includes the unit under the focal point, and is contiguous', () => {
    const ix = buildIndex(sentence(400))
    const sp = focusSpan(ix, 'sentence', 200, 2)!
    expect(sp.first).toBe(0)
    expect(sp.last).toBe(0)
    const ix2 = buildIndex(shortDoc)
    const sp2 = focusSpan(ix2, 'sentence', 40, 12)!
    expect(sp2.first).toBeLessThanOrEqual(sp2.center)
    expect(sp2.last).toBeGreaterThanOrEqual(sp2.center)
    expect(sp2.start).toBe(ix2.sentences.start[sp2.first])
    expect(sp2.end).toBe(ix2.sentences.end[sp2.last])
  })

  it('handles an empty document', () => {
    expect(focusSpan(buildIndex(''), 'sentence', 0, 10)).toBeNull()
  })
})

describe('focal point', () => {
  const ix = buildIndex('One two three. Four five six. Seven eight nine. Ten eleven twelve.')
  it('is the cursor itself at distance 0', () => {
    expect(focalPoint(ix, 'sentence', 7.5, 0)).toBe(7.5)
    expect(focalPoint(ix, 'word', 7.5, 0)).toBe(7.5)
  })
  it('sits D units back at the current scale, at the same place within the unit', () => {
    // cursor in the middle of "eight" (word 7) → one sentence back is the middle of "five" (word 4)
    expect(focalPoint(ix, 'sentence', 7.5, 1)).toBeCloseTo(4.5)
    expect(focalPoint(ix, 'word', 7.5, 2)).toBeCloseTo(5.5)
  })
  it('stops at the start of the document', () => {
    expect(focalPoint(ix, 'sentence', 7.5, 10)).toBeCloseTo(1.5)
  })
})

describe('source-to-preview alignment', () => {
  it('matches words in order and skips words that exist on one side only', () => {
    const src = ['See', 'the', 'docs', 'https', 'example', 'com', 'for', 'more']
    const pre = ['See', 'the', 'docs', 'for', 'more']
    const map = alignWords(src, pre)
    expect(Array.from(map)).toEqual([0, 1, 2, -1, -1, -1, 3, 4])
    expect(previewRange(map, 2, 7)).toEqual({ from: 2, to: 3 })
    expect(previewRange(map, 3, 6)).toBeNull()
  })

  it("doesn't drift when a stray source word appears later in the preview", () => {
    // "x" from a formula exists in the source only; a later preview word is also "x"
    const src = ['the', 'value', 'x', 'is', 'small', 'and', 'the', 'next', 'line', 'has', 'x', 'too']
    const pre = ['the', 'value', 'is', 'small', 'and', 'the', 'next', 'line', 'has', 'x', 'too']
    const map = Array.from(alignWords(src, pre))
    expect(map).toEqual([0, 1, -1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('finds the formulas to leave out of the match', () => {
    const t = 'Inline $x_0$ and display $$ b(x) = e $$ math.'
    expect(mathRanges(t).map(([a, b]) => t.slice(a, b))).toEqual(['$x_0$', '$$ b(x) = e $$'])
  })
})
