// Focus engine, part 2: the attention field and the focus.
//
// A focal point x₀ on the word ruler emits a bell-shaped field of attention,
// peak 1 at x₀:
//   b(x) = exp(−(x − x₀)² / 2σ²)          σ = the field's decay length, in words
// Every scale (words, sentences, paragraphs, sections) is laid on the same word
// ruler. A unit's ATTENTION is the field's AVERAGE over the unit's span, so a
// unit gets less attention both when it is farther away and when it is longer.
// (Area under the curve would make longer units take more attention, which is
// not how focus feels; the average has a closed form via erf, so no loops.)
//
// The FOCUS is the run of units that holds 60% of the cumulative attention at
// that scale: starting from the unit under the focal point, add whichever
// neighbour (left or right) gets more attention, until the units taken hold at
// least 60% of the attention of all units. Always one contiguous run, and the
// unit under the focal point is always in it.

import { type FocusIndex, type Scale, floorIndex, unitsOf } from './segment'

/** Share of the cumulative attention that is "in focus". */
export const FOCUS_SHARE = 0.6

// Beyond this many σ the field is below 1e-14: units out there get no attention.
const REACH = 8
const EPS = 1e-12

// erf: Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7) — plenty for attention.
function erf(x: number): number {
  const s = x < 0 ? -1 : 1
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return s * y
}
const SQRT2 = Math.SQRT2
const SQRT2PI = Math.sqrt(2 * Math.PI)

/** Average of the peak-1 bell (centre c, decay σ) over [a, b): a unit's attention. */
export function bellAverage(a: number, b: number, c: number, sigma: number): number {
  if (sigma <= 0) return a <= c && c < b ? 1 : 0
  const len = b - a
  if (len <= 1e-9) return Math.exp(-((a - c) ** 2) / (2 * sigma * sigma))
  const area = (sigma * SQRT2PI / 2) * (erf((b - c) / (sigma * SQRT2)) - erf((a - c) / (sigma * SQRT2)))
  return area / len
}

export interface FocusSpan {
  scale: Scale
  /** First and last unit in focus (inclusive), and the unit under the focal point. */
  first: number
  last: number
  center: number
  /** Character range in the source, from the first unit's start to the last unit's end. */
  start: number
  end: number
  /** Word range [w0, w1) the focus covers. */
  w0: number
  w1: number
  /** Attention of each unit first..last. */
  attention: Float32Array
  /** Share of the cumulative attention the focus holds (≥ FOCUS_SHARE unless it is everything). */
  share: number
}

/**
 * The focus at one scale around a focal point on the word ruler: the units
 * holding FOCUS_SHARE of the cumulative attention, grown outward from the unit
 * under the point by always taking the neighbour with more attention.
 */
export function focusSpan(index: FocusIndex, scale: Scale, x0: number, sigma: number, share = FOCUS_SHARE): FocusSpan | null {
  const u = unitsOf(index, scale)
  const n = u.length
  if (n === 0) return null
  const att = (i: number) => bellAverage(u.w0[i], u.w1[i], x0, sigma)

  // Only units within reach of the field get any attention.
  const lo = Math.min(n - 1, floorIndex(u.w1, x0 - REACH * sigma) + 1)
  const hi = Math.min(n - 1, Math.max(0, floorIndex(u.w0, x0 + REACH * sigma)))
  let total = 0
  for (let i = lo; i <= hi; i++) total += att(i)

  const k = Math.min(n - 1, Math.max(0, floorIndex(u.w0, x0)))
  let first = k
  let last = k
  let held = att(k)
  let left = first > 0 ? att(first - 1) : -1
  let right = last < n - 1 ? att(last + 1) : -1
  while (held < share * total && (left > EPS || right > EPS)) {
    if (left >= right) {
      first--
      held += left
      left = first > 0 ? att(first - 1) : -1
    } else {
      last++
      held += right
      right = last < n - 1 ? att(last + 1) : -1
    }
  }

  const attention = new Float32Array(last - first + 1)
  for (let i = first; i <= last; i++) attention[i - first] = att(i)
  return {
    scale,
    first,
    last,
    center: k,
    start: u.start[first],
    end: u.end[last],
    w0: u.w0[first],
    w1: u.w1[last],
    attention,
    share: total > 0 ? held / total : 1,
  }
}
