// Geometry and motion for the liquid-glass tab bar (components/TabBar.vue).
// Pure functions + a tiny spring; no DOM, so they're unit-tested.

export interface DentOptions {
  /** Bar width and height (px). The bar's ends are fully rounded. */
  width: number
  height: number
  /** The bubble: centre x, width, height, and the y of its centre line
   *  relative to the bar's top edge (negative = above the bar). */
  center: number
  bubbleWidth: number
  bubbleHeight: number
  bubbleCenterY: number
  /** Clearance between the bubble's underside and the dent's floor. */
  gap: number
  /** Extra run of each side of the valley beyond the bubble's round end,
   *  as a fraction of the bubble's radius — wider is gentler. */
  shoulder?: number
}

const f = (n: number) => (Math.round(n * 10) / 10).toString()

/**
 * The dent as a smooth valley in the bar's top edge, as if the bubble were
 * pressing into liquid: each side is an S-curve (horizontal at both ends)
 * from the top edge down to a gentle floor under the bubble's flat bottom.
 * Returns the control points, so tests can check the bubble clears it.
 */
export function dentGeometry(o: DentOptions) {
  const R = o.bubbleHeight / 2
  const flat = Math.max(0, o.bubbleWidth / 2 - R) // half the bubble's flat bottom
  const depth = Math.max(0, o.bubbleCenterY + R + o.gap)
  const side = R + o.gap + R * (o.shoulder ?? 1.15) // run of each S-curve
  return { R, flat, depth, side }
}

/** How far the valley reaches past each side of the bubble (to space tabs). */
export function dentSpread(o: Pick<DentOptions, 'bubbleHeight' | 'gap' | 'shoulder'>): number {
  const R = o.bubbleHeight / 2
  return o.gap + R * (o.shoulder ?? 1.15)
}

/**
 * SVG path of the bar: a pill whose top edge flows down into the valley.
 * Used for both the glass (clip-path) and its lit rim.
 */
export function dentPath(o: DentOptions): string {
  const { width: W, height: H } = o
  const r = H / 2
  if (W <= 2 * r) return ''
  const { flat, depth: d0, side } = dentGeometry(o)
  const d = Math.min(d0, H - 8)

  // Keep the whole valley on the straight part of the top edge.
  const lo = r + flat + side
  const hi = W - r - flat - side
  const c = lo <= hi ? Math.max(lo, Math.min(o.center, hi)) : W / 2

  const a = c - flat - side // valley starts
  const b = c - flat // floor starts
  const e = c + flat // floor ends
  const z = c + flat + side // valley ends
  const m = side / 2 // S-curve handles: halfway along each side
  return [
    `M${f(r)},0`,
    `L${f(a)},0`,
    `C${f(a + m)},0 ${f(b - m)},${f(d)} ${f(b)},${f(d)}`,
    `L${f(e)},${f(d)}`,
    `C${f(e + m)},${f(d)} ${f(z - m)},0 ${f(z)},0`,
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
