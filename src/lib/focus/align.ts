// Focus engine, part 4: line up the words of the markdown source with the
// words of the rendered preview, so a span of source words can be underlined
// in the preview. The preview is the source minus markup, so its words appear
// in the same order; markup-only words (link URLs, code fences, TeX commands)
// exist on one side only. A greedy in-order match with a bounded lookahead
// handles those without a full diff.

const LOOKAHEAD = 40

/**
 * For each source word, the index of the matching preview word, or -1.
 * Matches are strictly increasing.
 */
export function alignWords(source: string[], preview: string[]): Int32Array {
  const map = new Int32Array(source.length).fill(-1)
  const norm = (w: string) => w.toLowerCase()
  const prev = preview.map(norm)
  let j = 0
  for (let i = 0; i < source.length && j < prev.length; i++) {
    const s = norm(source[i])
    const limit = Math.min(prev.length, j + LOOKAHEAD)
    for (let k = j; k < limit; k++) {
      if (prev[k] === s) {
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
