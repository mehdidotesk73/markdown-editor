// Geometry and motion for the liquid-glass tab bar (components/TabBar.vue).
// Pure functions + a tiny spring; no DOM, so they're unit-tested.

export interface DentOptions {
  /** Bar width and height (px). The bar's ends are fully rounded. */
  width: number
  height: number
  /** The bubble: centre x, width, and the y of its centre line relative to
   *  the bar's top edge (negative = above the bar). Its ends are round. */
  center: number
  bubbleWidth: number
  bubbleHeight: number
  bubbleCenterY: number
  /** Clearance between the bubble and the dent around it. */
  gap: number
  /** Radius of the rounded lip where the dent meets the bar's top edge. */
  fillet?: number
}

const f = (n: number) => (Math.round(n * 10) / 10).toString()

/**
 * How far the dent spreads past each side of the bubble along the bar's top
 * edge (so tabs can be spaced to clear it).
 */
export function dentSpread(o: Pick<DentOptions, 'bubbleHeight' | 'bubbleCenterY' | 'gap' | 'fillet'>): number {
  const R = o.bubbleHeight / 2
  const Ro = R + o.gap
  const rf = o.fillet ?? 10
  const reach = Math.sqrt(Math.max(0, (Ro + rf) ** 2 - (rf - o.bubbleCenterY) ** 2))
  return reach - R
}

/**
 * SVG path of the bar: a pill whose top edge dips into a dent that follows
 * the bubble's own contour — two arcs hugging its round ends and a floor
 * under its flat bottom, offset by `gap` — with rounded lips where the dent
 * meets the top edge. Used for both the glass (clip-path) and its lit edge.
 */
export function dentPath(o: DentOptions): string {
  const { width: W, height: H } = o
  const r = H / 2
  if (W <= 2 * r) return ''
  const R = o.bubbleHeight / 2
  const Ro = R + o.gap // dent radius around each round end
  const rf = o.fillet ?? 10
  const cy = o.bubbleCenterY
  const half = Math.max(R, o.bubbleWidth / 2)
  const spread = dentSpread(o)

  // Keep the whole dent on the straight part of the top edge.
  const lo = r + half + spread
  const hi = W - r - half - spread
  const c = lo <= hi ? Math.max(lo, Math.min(o.center, hi)) : W / 2

  const cL = c - half + R // centres of the bubble's round ends
  const cR = c + half - R
  const floor = cy + Ro
  const reach = spread + R // from an end's centre to where the lip leaves the top edge
  // Where each lip (fillet circle at height rf) touches the dent arc.
  const k = Ro / (Ro + rf)
  const tLx = cL + (-reach) * k
  const tRx = cR + reach * k
  const tY = cy + (rf - cy) * k

  return [
    `M${f(r)},0`,
    `L${f(cL - reach)},0`,
    `A${f(rf)},${f(rf)} 0 0 1 ${f(tLx)},${f(tY)}`, // lip rolls over the edge
    `A${f(Ro)},${f(Ro)} 0 0 0 ${f(cL)},${f(floor)}`, // down around the bubble's left end
    `L${f(cR)},${f(floor)}`, // under its flat bottom
    `A${f(Ro)},${f(Ro)} 0 0 0 ${f(tRx)},${f(tY)}`, // up around its right end
    `A${f(rf)},${f(rf)} 0 0 1 ${f(cR + reach)},0`, // and over the lip
    `L${f(W - r)},0`,
    `A${f(r)},${f(r)} 0 0 1 ${f(W - r)},${f(H)}`,
    `L${f(r)},${f(H)}`,
    `A${f(r)},${f(r)} 0 0 1 ${f(r)},0`,
    'Z',
  ].join(' ')
}

/**
 * How far a tab's name has sunk under the bubble: 0 when the bubble is clear
 * of it, rising smoothly to 1 when the bubble is centred over it.
 */
export function labelSink(tabCenter: number, tabWidth: number, bubbleCenter: number, bubbleWidth: number): number {
  const reach = (tabWidth + bubbleWidth) / 2
  if (reach <= 0) return 0
  const t = Math.max(0, Math.min(1, 1 - Math.abs(tabCenter - bubbleCenter) / reach))
  return t * t * (3 - 2 * t) // smoothstep
}

/**
 * A damped spring, slightly under-damped so a move lands with a small
 * liquid wobble. step() returns true once it has settled.
 */
export class Spring {
  value: number
  target: number
  velocity = 0
  constructor(
    value: number,
    public stiffness = 240,
    public damping = 22,
  ) {
    this.value = value
    this.target = value
  }
  set(v: number) {
    this.value = this.target = v
    this.velocity = 0
  }
  step(dt: number): boolean {
    const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping
    this.velocity += force * dt
    this.value += this.velocity * dt
    const settled = Math.abs(this.target - this.value) < 0.05 && Math.abs(this.velocity) < 0.5
    if (settled) this.set(this.target)
    return settled
  }
}
