// Reordering tabs by dragging (TabBar.vue measures and draws; this decides).
// While a tab is dragged, it follows the pointer and the tabs it passes slide
// over by one slot to show where it will land.

/** A copy of `items` with the one at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = items.slice()
  if (from === to || from < 0 || from >= out.length) return out
  const [it] = out.splice(from, 1)
  out.splice(Math.max(0, Math.min(out.length, to)), 0, it)
  return out
}

/**
 * Where the tab dragged from `from` lands, given the other tabs' centres
 * (in order) and the dragged tab's own centre now: past every tab whose
 * centre it has crossed.
 */
export function dropIndex(centres: readonly number[], from: number, at: number): number {
  let to = 0
  centres.forEach((c, k) => {
    if (k !== from && c < at) to++
  })
  return to
}

/**
 * How many slots tab `k` slides while the tab from `from` is over `to`:
 * -1 (left, to fill the gap it left), +1 (right, to make room) or 0.
 */
export function slideOf(k: number, from: number, to: number): -1 | 0 | 1 {
  if (k === from) return 0
  if (from < to && k > from && k <= to) return -1
  if (from > to && k >= to && k < from) return 1
  return 0
}

/** Pixels moved before a press counts as a drag (so a click still just picks the tab). */
export const DRAG_THRESHOLD = 5
