// Focus engine, part 2: the focus wave and the shadow's span.
//
// A bell curve, peak 1 at the focus point x₀, falls off with distance:
//   b(x) = exp(−(x − x₀)² / 2σ²)
// A unit's score is its AVERAGE bell value over its length on the ruler — so
// a long sentence, spread over the curve's lower slopes, scores lower than a
// short one at the same distance. That is what makes long sentences and
// paragraphs harder to hold in focus. The average has a closed form (two
// normal-CDF lookups), so no per-letter loop.
//
// Rulers ("mode"):
//   linear — every scale measured in words (a paragraph's length = its words)
//   nested — each scale measured in units of the scale below: sentences in
//            words, paragraphs in sentences, sections in paragraphs.
// Intensity is always given in words; on a nested ruler it is converted by
// the document's average words per child unit, so the slider means about
// the same spread in either mode.

import { type FocusIndex, type Scale, type Units, floorIndex, unitsOf } from './segment'

export type Mode = 'linear' | 'nested'

/** Below this average bell value a unit is out of the shadow (fixed cut-off). */
export const THRESHOLD = 0.4

// erf: Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7) — plenty for scores.
function erf(x: number): number {
  const s = x < 0 ? -1 : 1
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return s * y
}
const SQRT2 = Math.SQRT2
const SQRT2PI = Math.sqrt(2 * Math.PI)

/** Average of the peak-1 bell (centre c, width σ) over [a, b). */
export function bellAverage(a: number, b: number, c: number, sigma: number): number {
  if (sigma <= 0) return a <= c && c < b ? 1 : 0
  const len = b - a
  if (len <= 1e-9) return Math.exp(-((a - c) ** 2) / (2 * sigma * sigma))
  const area = (sigma * SQRT2PI / 2) * (erf((b - c) / (sigma * SQRT2)) - erf((a - c) / (sigma * SQRT2)))
  return area / len
}

/** A ruler: where each unit starts and ends, and the focus point, in one coordinate. */
interface Ruler {
  lo: Int32Array
  hi: Int32Array
  /** Converts a position on the word ruler to this ruler. */
  fromWords: (x: number) => number
  /** Converts a width in words to this ruler's units. */
  sigmaFromWords: (sigma: number) => number
}

/** Position on a ruler whose units are `child` (each child = 1), from a word position. */
function childCoord(child: Units, x: number): number {
  if (child.length === 0) return 0
  const k = floorIndex(child.w0, x)
  if (k < 0) return 0
  if (x >= child.w1[k]) return k + 1
  return k + (x - child.w0[k]) / Math.max(1, child.w1[k] - child.w0[k])
}

function rulerFor(index: FocusIndex, scale: Scale, mode: Mode): Ruler {
  const words = (u: Units): Ruler => ({ lo: u.w0, hi: u.w1, fromWords: (x) => x, sigmaFromWords: (s) => s })
  if (mode === 'linear' || scale === 'word' || scale === 'sentence') return words(unitsOf(index, scale))
  // nested: paragraphs on the sentence ruler, sections on the paragraph ruler
  const child = scale === 'paragraph' ? index.sentences : index.paragraphs
  const range = scale === 'paragraph' ? { lo: index.paraSentences.s0, hi: index.paraSentences.s1 } : { lo: index.sectionParas.p0, hi: index.sectionParas.p1 }
  const wordsPerChild = child.length ? index.words.length / child.length : 1
  return {
    lo: range.lo,
    hi: range.hi,
    fromWords: (x) => childCoord(child, x),
    sigmaFromWords: (s) => s / Math.max(1e-9, wordsPerChild),
  }
}

export interface FocusSpan {
  scale: Scale
  /** First and last unit in the span (inclusive) and the unit under the focus point. */
  first: number
  last: number
  center: number
  /** Character range in the source, from the first unit's start to the last unit's end. */
  start: number
  end: number
  /** Word range [w0, w1) the span covers. */
  w0: number
  w1: number
  /** Score of each unit first..last. */
  scores: Float32Array
}

/**
 * The span of units held in focus around a point on the word ruler: start at
 * the unit under the point (always included) and extend each way until the
 * first unit whose score falls to the cut-off. Always one contiguous run.
 */
export function focusSpan(
  index: FocusIndex,
  scale: Scale,
  mode: Mode,
  xWords: number,
  intensityWords: number,
  threshold = THRESHOLD,
): FocusSpan | null {
  const units = unitsOf(index, scale)
  const n = units.length
  if (n === 0) return null
  const r = rulerFor(index, scale, mode)
  const c = r.fromWords(xWords)
  const sigma = r.sigmaFromWords(intensityWords)
  const score = (i: number) => bellAverage(r.lo[i], r.hi[i], c, sigma)

  const k = Math.min(n - 1, Math.max(0, floorIndex(r.lo, c)))
  let first = k
  let last = k
  while (first > 0 && score(first - 1) > threshold) first--
  while (last < n - 1 && score(last + 1) > threshold) last++

  const scores = new Float32Array(last - first + 1)
  for (let i = first; i <= last; i++) scores[i - first] = score(i)
  return {
    scale,
    first,
    last,
    center: k,
    start: units.start[first],
    end: units.end[last],
    w0: units.w0[first],
    w1: units.w1[last],
    scores,
  }
}
