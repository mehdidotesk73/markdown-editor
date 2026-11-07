import { describe, it, expect } from 'vitest'
import { buildIndex, splitBlocks, wordCoord } from './segment'
import { bellAverage, focusSpan } from './wave'
import { Shadow } from './shadow'
import { alignWords, previewRange } from './align'

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

describe('focus wave', () => {
  it('peaks at 1 at the focus point and averages lower over longer spans', () => {
    expect(bellAverage(4.999, 5.001, 5, 3)).toBeCloseTo(1, 3)
    const short = bellAverage(5, 8, 4, 3)
    const long = bellAverage(5, 20, 4, 3)
    expect(long).toBeLessThan(short)
  })

  it('is symmetric about the focus point', () => {
    expect(bellAverage(0, 2, 5, 3)).toBeCloseTo(bellAverage(8, 10, 5, 3), 6)
  })

  // Sentences start with a capital, as real ones do: sentence splitting (ICU) won't
  // break before a lowercase word, in case the full stop ends an abbreviation.
  const sentence = (n: number) => Array.from({ length: n }, (_, i) => (i ? `w${i}` : 'W0')).join(' ') + '.'
  const shortDoc = Array.from({ length: 30 }, () => sentence(4)).join(' ')
  const longDoc = Array.from({ length: 30 }, () => sentence(20)).join(' ')

  it('holds fewer long sentences than short ones at the same intensity', () => {
    const s = buildIndex(shortDoc)
    const l = buildIndex(longDoc)
    const midS = s.words.length / 2
    const midL = l.words.length / 2
    const spanS = focusSpan(s, 'sentence', 'linear', midS, 12)!
    const spanL = focusSpan(l, 'sentence', 'linear', midL, 12)!
    expect(spanS.last - spanS.first + 1).toBeGreaterThan(spanL.last - spanL.first + 1)
  })

  it('grows the span as intensity rises', () => {
    const ix = buildIndex(shortDoc)
    const mid = ix.words.length / 2
    let prev = 0
    for (const intensity of [2, 6, 12, 24]) {
      const sp = focusSpan(ix, 'word', 'linear', mid, intensity)!
      const n = sp.last - sp.first + 1
      expect(n).toBeGreaterThanOrEqual(prev)
      prev = n
    }
    expect(prev).toBeGreaterThan(10)
  })

  it('always includes the unit under the focus point, even a very long one', () => {
    const ix = buildIndex(sentence(400))
    const sp = focusSpan(ix, 'sentence', 'linear', 200, 2)!
    expect(sp.first).toBe(0)
    expect(sp.last).toBe(0)
  })

  it('returns a contiguous span with scores, and source and word ranges', () => {
    const ix = buildIndex(shortDoc)
    const sp = focusSpan(ix, 'sentence', 'linear', 40, 12)!
    expect(sp.scores.length).toBe(sp.last - sp.first + 1)
    expect(sp.start).toBe(ix.sentences.start[sp.first])
    expect(sp.end).toBe(ix.sentences.end[sp.last])
    expect(sp.w0).toBe(ix.sentences.w0[sp.first])
  })

  it('measures paragraphs differently in nested mode (by sentences, not words)', () => {
    // paragraphs of 1 long sentence vs 4 short sentences, same word count
    const p1 = sentence(16)
    const p4 = [sentence(4), sentence(4), sentence(4), sentence(4)].join(' ')
    const doc = Array.from({ length: 12 }, (_, i) => (i % 2 ? p1 : p4)).join('\n\n')
    const ix = buildIndex(doc)
    const mid = ix.words.length / 2
    const lin = focusSpan(ix, 'paragraph', 'linear', mid, 24)!
    const nes = focusSpan(ix, 'paragraph', 'nested', mid, 24)!
    expect(lin.scores.join()).not.toBe(nes.scores.join())
  })

  it('handles an empty document', () => {
    expect(focusSpan(buildIndex(''), 'sentence', 'linear', 0, 10)).toBeNull()
  })
})

describe('shadow', () => {
  it('trails the cursor at exactly the distance, forwards and backwards', () => {
    const s = new Shadow()
    s.reset(0)
    for (let x = 0; x <= 100; x += 7) s.step(x, 20)
    expect(s.step(100, 20)).toBe(80)
    for (let x = 100; x >= 0; x -= 7) s.step(x, 20)
    expect(s.step(0, 20)).toBe(20)
  })

  it('stays put while the cursor moves within the distance', () => {
    const s = new Shadow()
    s.reset(50)
    expect(s.step(60, 20)).toBe(50)
    expect(s.step(40, 20)).toBe(50)
  })

  it('sits on the cursor at distance 0', () => {
    const s = new Shadow()
    expect(s.step(33, 0)).toBe(33)
    expect(s.step(12, 0)).toBe(12)
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
})
