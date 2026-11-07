// Focus engine, part 3: the focal point — where the attention field is
// emitted from — follows the cursor's PATH with a lag.
//
// For each scale, a trail records the last distinct units the cursor has been
// in (consecutive repeats collapse: moving within a sentence doesn't add a new
// step; going A → B → A adds three). Each entry keeps the cursor's latest
// position inside that unit. With lag L the focal point is the entry L steps
// back along the trail — the place the cursor was L units ago, wherever in the
// document that is. Lag 0 is the cursor itself. Until the trail is L long, the
// focal point sits on its oldest entry. Constant time per move.

import { type FocusIndex, type Scale, SCALES, floorIndex, unitsOf } from './segment'

/** The longest lag a trail can serve. */
export const MAX_LAG = 20

interface Step {
  unit: number
  /** The cursor's latest position in this unit, on the word ruler. */
  x: number
}

/** One scale's trail of distinct units, newest last. */
export class Trail {
  private steps: Step[] = []

  /** The cursor is at `x`, inside unit `unit`. */
  record(unit: number, x: number) {
    const last = this.steps[this.steps.length - 1]
    if (last && last.unit === unit) {
      last.x = x
      return
    }
    this.steps.push({ unit, x })
    if (this.steps.length > MAX_LAG + 1) this.steps.shift()
  }

  /** Where the cursor was `lag` distinct units ago (the oldest entry if the trail is shorter). */
  at(lag: number): number | null {
    const n = this.steps.length
    if (n === 0) return null
    const i = Math.max(0, n - 1 - Math.max(0, Math.round(lag)))
    return this.steps[i].x
  }

  get length() {
    return this.steps.length
  }

  clear() {
    this.steps = []
  }
}

/** The unit containing a position on the word ruler, at one scale. */
export function unitAt(index: FocusIndex, scale: Scale, x: number): number {
  const u = unitsOf(index, scale)
  if (u.length === 0) return -1
  return Math.min(u.length - 1, Math.max(0, floorIndex(u.w0, x)))
}

/** Trails for every scale, fed together so switching scale keeps its history. */
export class Trails {
  private trails = new Map<Scale, Trail>(SCALES.map((s) => [s, new Trail()]))

  /** Record a cursor position (word ruler) at every scale. */
  record(index: FocusIndex, x: number) {
    for (const s of SCALES) this.trails.get(s)!.record(unitAt(index, s, x), x)
  }

  /** The focal point at a scale with a lag (falls back to the cursor `x`). */
  focal(scale: Scale, lag: number, x: number): number {
    if (lag <= 0) return x
    return this.trails.get(scale)!.at(lag) ?? x
  }

  clear() {
    for (const t of this.trails.values()) t.clear()
  }
}
