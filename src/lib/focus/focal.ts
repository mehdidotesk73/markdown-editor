// Focus engine, part 3: the focal point — where the attention field is
// emitted from. It sits DISTANCE units behind the cursor, counted in units of
// the scale in view: at the Sentences scale, distance 2 puts it two sentences
// back. It keeps the cursor's relative place within its unit (so distance 0 is
// the cursor itself, and moving through a sentence moves the focal point
// through the sentence D back). A fixed lag in document order: move backwards
// and it moves backwards with you, still D units earlier. Constant time.

import { type FocusIndex, type Scale, floorIndex, unitsOf } from './segment'

/** The focal point on the word ruler for a cursor at `cursorX` (word ruler). */
export function focalPoint(index: FocusIndex, scale: Scale, cursorX: number, distance: number): number {
  const u = unitsOf(index, scale)
  if (u.length === 0) return cursorX
  const k = Math.min(u.length - 1, Math.max(0, floorIndex(u.w0, cursorX)))
  const len = Math.max(1e-9, u.w1[k] - u.w0[k])
  const frac = Math.min(0.999, Math.max(0, (cursorX - u.w0[k]) / len))
  const t = Math.max(0, k - Math.max(0, Math.round(distance)))
  if (t === k) return cursorX
  return u.w0[t] + frac * (u.w1[t] - u.w0[t])
}
