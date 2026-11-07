// Focus engine, part 4: line up the words of the markdown source with the
// words of the rendered preview, so a span of source words can be underlined
// in the preview. The preview is the source minus markup, so its words appear
// in the same order; markup-only words (link URLs, code fences, TeX) exist on
// one side only.
//
// Greedy, in order, with a bounded lookahead — and every match must be
// CONFIRMED by the words that follow it. Without that, a stray source word
// (the "x" of a formula, the "com" of a URL) can match a word further down
// the preview, jump the pointer ahead, and every later word then drifts.

const LOOKAHEAD = 60
const CONFIRM_WORDS = 2 // following words that must line up for a match to count
const CONFIRM_SCAN = 6 // how many following source words may be looked at (markup like a URL skipped)

/** Source ranges that never appear as words in the preview: inline and display math. */
export function mathRanges(text: string): [number, number][] {
  const out: [number, number][] = []
  const re = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g
  for (let m = re.exec(text); m; m = re.exec(text)) out.push([m.index, m.index + m[0].length])
  return out
}

/**
 * For each source word, the index of the matching preview word, or -1.
 * Matches are strictly increasing. Empty source words are never matched.
 */
export function alignWords(source: string[], preview: string[]): Int32Array {
  const map = new Int32Array(source.length).fill(-1)
  const src = source.map((w) => w.toLowerCase())
  const prev = preview.map((w) => w.toLowerCase())

  // Do the source words after i line up with the preview words after k?
  const confirmed = (i: number, k: number) => {
    let q = k + 1
    let seen = 0
    for (let t = i + 1; t < src.length && t <= i + CONFIRM_SCAN && q < prev.length; t++) {
      if (!src[t]) continue
      seen++
      if (src[t] === prev[q]) q++
    }
    const need = Math.min(CONFIRM_WORDS, seen, prev.length - (k + 1))
    return q - (k + 1) >= need
  }

  let j = 0
  for (let i = 0; i < src.length && j < prev.length; i++) {
    const s = src[i]
    if (!s) continue
    const limit = Math.min(prev.length, j + LOOKAHEAD)
    for (let k = j; k < limit; k++) {
      if (prev[k] === s && confirmed(i, k)) {
        map[i] = k
        j = k + 1
        break
      }
    }
  }
  return map
}

/**
 * The preview words covering source words [w0, w1): the first and last
 * matched preview word inside the range, or null if none matched.
 */
export function previewRange(map: Int32Array, w0: number, w1: number): { from: number; to: number } | null {
  let from = -1
  let to = -1
  for (let i = Math.max(0, w0); i < Math.min(map.length, w1); i++) {
    if (map[i] < 0) continue
    if (from < 0) from = map[i]
    to = map[i]
  }
  return from < 0 ? null : { from, to }
}
