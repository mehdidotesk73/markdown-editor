// Focus engine, part 3: the shadow — a point on the word ruler that trails the
// cursor on a leash. While the cursor moves within `distance` words of it, the
// shadow stays put; once the cursor gets further, the shadow is dragged along
// to stay exactly `distance` behind, whichever way the cursor is going.
// Constant time, and the same inputs always give the same shadow.

export class Shadow {
  private x: number | null = null

  /** Current shadow position, or null before the first step. */
  get position(): number | null {
    return this.x
  }

  /** Put the shadow on the cursor (new tab, document replaced). */
  reset(cursor: number) {
    this.x = cursor
  }

  /** Move the cursor; returns the shadow's new position. */
  step(cursor: number, distance: number): number {
    if (this.x === null) this.x = cursor
    const d = Math.max(0, distance)
    const gap = cursor - this.x
    if (gap > d) this.x = cursor - d
    else if (gap < -d) this.x = cursor + d
    return this.x
  }
}
