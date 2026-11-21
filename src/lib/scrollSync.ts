// Keeping the editor and the preview level, by content rather than by scroll
// percentage. Both panes are mapped onto the same axis — the source line, with
// fractions — and synced at their vertical middles:
//
//   editor:  each source line's top, measured in the editor (wrapped lines are
//            taller), gives  y ⇄ line.
//   preview: each rendered block carries the line it starts on (data-line); its
//            top gives an anchor. Between two anchors, lines are spread evenly
//            over the space between them, so a tall diagram or table takes up
//            its source lines' share of the scroll.
//
// So the line at the middle of the editor lands at the middle of the preview,
// and the other way round. Pure: the component measures, this maps.

export interface Anchor {
  /** Source line (0-based) a block starts on. */
  line: number
  /** The block's top, in px from the top of the preview's content. */
  top: number
}

/** Largest i with xs[i] <= v (xs ascending); -1 if v is before them all. */
function floorIndex(xs: number[], v: number): number {
  let lo = 0
  let hi = xs.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= v) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

/**
 * Anchors in order: sorted by line, keeping the first block on each line and
 * only those that go down the page (a block can't be above one from an earlier
 * line), with the document's start and end added so every line is covered.
 */
export function cleanAnchors(raw: Anchor[], lineCount: number, contentHeight: number): Anchor[] {
  const out: Anchor[] = [{ line: 0, top: 0 }]
  for (const a of [...raw].sort((x, y) => x.line - y.line || x.top - y.top)) {
    const last = out[out.length - 1]
    if (a.line === last.line) continue
    if (a.top < last.top) continue
    out.push(a)
  }
  const last = out[out.length - 1]
  if (lineCount > last.line) out.push({ line: lineCount, top: Math.max(last.top, contentHeight) })
  return out
}

/** Map between two monotone axes, piecewise linearly. */
function interpolate(xs: number[], ys: number[], x: number): number {
  if (!xs.length) return 0
  const i = floorIndex(xs, x)
  if (i < 0) return ys[0]
  if (i >= xs.length - 1) return ys[xs.length - 1]
  const span = xs[i + 1] - xs[i]
  return span > 0 ? ys[i] + ((x - xs[i]) / span) * (ys[i + 1] - ys[i]) : ys[i]
}

/** The source line (fractional) at a height in the editor, from each line's top. */
export function editorLineAt(lineTops: number[], y: number, contentHeight: number): number {
  const lines = lineTops.map((_, i) => i)
  return interpolate([...lineTops, contentHeight], [...lines, lineTops.length], y)
}

/** The height in the editor where a source line (fractional) sits. */
export function editorTopOf(lineTops: number[], line: number, contentHeight: number): number {
  const lines = lineTops.map((_, i) => i)
  return interpolate([...lines, lineTops.length], [...lineTops, contentHeight], line)
}

/** The height in the preview where a source line (fractional) sits. */
export function previewTopOf(anchors: Anchor[], line: number): number {
  return interpolate(
    anchors.map((a) => a.line),
    anchors.map((a) => a.top),
    line,
  )
}

/** The source line (fractional) at a height in the preview. */
export function previewLineAt(anchors: Anchor[], y: number): number {
  return interpolate(
    anchors.map((a) => a.top),
    anchors.map((a) => a.line),
    y,
  )
}

/**
 * Where to scroll a pane so that `target` (a height in its content) sits at its
 * middle — except at the ends: a pane scrolled to its top or bottom pins the
 * other to its top or bottom, so both start and finish together.
 */
export function scrollFor(target: number, viewport: number, scrollHeight: number, sourceAt: 'top' | 'bottom' | 'middle'): number {
  const max = Math.max(0, scrollHeight - viewport)
  if (sourceAt === 'top') return 0
  if (sourceAt === 'bottom') return max
  return Math.min(max, Math.max(0, target - viewport / 2))
}

/** Is a pane at its top, its bottom, or in between? */
export function edgeOf(scrollTop: number, viewport: number, scrollHeight: number): 'top' | 'bottom' | 'middle' {
  if (scrollTop <= 1) return 'top'
  if (scrollTop >= scrollHeight - viewport - 1) return 'bottom'
  return 'middle'
}
