// Focus engine, part 1: segment a markdown source into the four scales the
// focus works on — words, sentences, paragraphs, sections — as compact
// ranges. Pure (no DOM); runs on every edit and tab switch, so it stays
// linear in the length of the text.
//
// The shared ruler is the word: word i occupies [i, i + 1). Every higher
// unit records the run of words it holds, so its length on the ruler is its
// word count. Sentences also record their paragraph's sentence range and
// paragraphs their section's paragraph range, for the "nested" rulers.

export type Scale = 'word' | 'sentence' | 'paragraph' | 'section'
export const SCALES: Scale[] = ['word', 'sentence', 'paragraph', 'section']

/** Units at one scale: character range in the source and word range [w0, w1). */
export interface Units {
  start: Int32Array
  end: Int32Array
  w0: Int32Array
  w1: Int32Array
  length: number
}

export interface FocusIndex {
  text: string
  words: Units
  sentences: Units
  paragraphs: Units
  sections: Units
  /** For each paragraph, its sentences [s0, s1); for each section, its paragraphs [p0, p1). */
  paraSentences: { s0: Int32Array; s1: Int32Array }
  sectionParas: { p0: Int32Array; p1: Int32Array }
}

class Builder {
  start: number[] = []
  end: number[] = []
  w0: number[] = []
  w1: number[] = []
  push(s: number, e: number, a: number, b: number) {
    this.start.push(s)
    this.end.push(e)
    this.w0.push(a)
    this.w1.push(b)
  }
  done(): Units {
    return {
      start: Int32Array.from(this.start),
      end: Int32Array.from(this.end),
      w0: Int32Array.from(this.w0),
      w1: Int32Array.from(this.w1),
      length: this.start.length,
    }
  }
}

/** A block of source text: a paragraph, list item, heading, code block or table row. */
interface Block {
  start: number
  end: number
  heading: boolean
  /** Fenced code: one sentence, not split line by line. */
  code?: boolean
}

const FENCE = /^\s{0,3}(```|~~~)/
const HEADING = /^\s{0,3}#{1,6}(\s|$)/
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/
const BLANK = /^\s*$/

/** Split the source into blocks, line by line. Fenced code stays one block. */
export function splitBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  let inFence = false
  let pos = 0
  const close = () => {
    if (cur) blocks.push(cur)
    cur = null
  }
  for (const line of text.split('\n')) {
    const s = pos
    const e = pos + line.length
    pos = e + 1
    if (inFence) {
      cur!.end = e
      if (FENCE.test(line)) {
        inFence = false
        close()
      }
      continue
    }
    if (FENCE.test(line)) {
      close()
      cur = { start: s, end: e, heading: false, code: true }
      inFence = true
      continue
    }
    if (BLANK.test(line)) {
      close()
      continue
    }
    if (HEADING.test(line)) {
      close()
      blocks.push({ start: s, end: e, heading: true })
      continue
    }
    if (LIST_ITEM.test(line) || /^\s*\|/.test(line)) {
      close()
      cur = { start: s, end: e, heading: false }
      continue
    }
    if (cur) cur.end = e
    else cur = { start: s, end: e, heading: false }
  }
  close()
  return blocks
}

const sentenceSeg = new Intl.Segmenter(undefined, { granularity: 'sentence' })
const wordSeg = new Intl.Segmenter(undefined, { granularity: 'word' })

/** Index a markdown source. Units with no words are dropped — they can't hold focus. */
export function buildIndex(text: string): FocusIndex {
  const words = new Builder()
  const sentences = new Builder()
  const paragraphs = new Builder()
  const sections = new Builder()
  const ps0: number[] = []
  const ps1: number[] = []
  const sp0: number[] = []
  const sp1: number[] = []

  let sectionStart = -1
  let sectionW0 = 0
  let sectionP0 = 0
  const closeSection = (endChar: number) => {
    if (sectionStart >= 0 && words.start.length > sectionW0) {
      sections.push(sectionStart, endChar, sectionW0, words.start.length)
      sp0.push(sectionP0)
      sp1.push(paragraphs.start.length)
    }
  }

  for (const block of splitBlocks(text)) {
    if (block.heading || sectionStart < 0) {
      closeSection(block.start)
      sectionStart = block.start
      sectionW0 = words.start.length
      sectionP0 = paragraphs.start.length
    }
    const body = text.slice(block.start, block.end)
    const paraW0 = words.start.length
    const paraS0 = sentences.start.length
    // A code block is one sentence; prose is split by the sentence segmenter.
    const sentenceParts = block.code ? [{ index: 0, segment: body }] : sentenceSeg.segment(body)
    for (const s of sentenceParts) {
      const sStart = block.start + s.index
      const sentW0 = words.start.length
      for (const w of wordSeg.segment(s.segment)) {
        if (!w.isWordLike) continue
        const ws = sStart + w.index
        words.push(ws, ws + w.segment.length, words.start.length, words.start.length + 1)
      }
      if (words.start.length > sentW0) {
        const sEnd = sStart + s.segment.trimEnd().length
        sentences.push(sStart, sEnd, sentW0, words.start.length)
      }
    }
    if (words.start.length > paraW0) {
      paragraphs.push(block.start, block.end, paraW0, words.start.length)
      ps0.push(paraS0)
      ps1.push(sentences.start.length)
    }
  }
  closeSection(text.length)

  return {
    text,
    words: words.done(),
    sentences: sentences.done(),
    paragraphs: paragraphs.done(),
    sections: sections.done(),
    paraSentences: { s0: Int32Array.from(ps0), s1: Int32Array.from(ps1) },
    sectionParas: { p0: Int32Array.from(sp0), p1: Int32Array.from(sp1) },
  }
}

export function unitsOf(index: FocusIndex, scale: Scale): Units {
  return scale === 'word' ? index.words : scale === 'sentence' ? index.sentences : scale === 'paragraph' ? index.paragraphs : index.sections
}

/** Index of the last element of `arr` that is <= x (binary search); -1 if none. */
export function floorIndex(arr: Int32Array, x: number): number {
  let lo = 0
  let hi = arr.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= x) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/**
 * The cursor's position on the word ruler. Inside word i it is i plus how far
 * through the word the cursor sits; between words it is the boundary index.
 */
export function wordCoord(index: FocusIndex, offset: number): number {
  const w = index.words
  if (w.length === 0) return 0
  const i = floorIndex(w.start, offset)
  if (i < 0) return 0
  if (offset >= w.end[i]) return i + 1
  return i + (offset - w.start[i]) / Math.max(1, w.end[i] - w.start[i])
}
