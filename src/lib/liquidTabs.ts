// Geometry and motion for the liquid-glass tab bar (components/TabBar.vue).
// Pure functions + a tiny spring; no DOM, so they're unit-tested.

export interface DentOptions {
  /** Bar width and height (px). The bar's ends are fully rounded. */
  width: number
  height: number
  /** Dent centre (px from the bar's left edge) and half-width at its floor. */
  center: number
  halfWidth: number
  /** How far the dent's floor sits below the bar's top edge. */
  depth: number
  /** Width of each curved shoulder leading into the dent. */
  shoulder?: number
}

const f = (n: number) => (Math.round(n * 10) / 10).toString()

/**
 * SVG path of the bar: a pill whose top edge dips into a smooth dent under
 * the bubble. Used for both the glass (as a clip-path) and its lit edge.
 */
export function dentPath({ width: W, height: H, center, halfWidth, depth, shoulder = 16 }: DentOptions): string {
  const r = H / 2
  if (W <= 2 * r) return ''
  // Keep the dent inside the straight part of the top edge.
  const hw = Math.max(0, Math.min(halfWidth, (W - 2 * r - 2 * shoulder) / 2))
  const c = Math.max(r + shoulder + hw, Math.min(center, W - r - shoulder - hw))
  const d = Math.max(0, Math.min(depth, H - 6))
  const k = Math.min(hw, d) // how far the floor's rounding reaches in

  const L0 = c - hw - shoulder // shoulder starts (on the top edge)
  const R0 = c + hw + shoulder
  return [
    `M${f(r)},0`,
    `L${f(L0)},0`,
    // down the left shoulder into the floor
    `C${f(L0 + shoulder * 0.62)},0 ${f(c - hw - shoulder * 0.12)},${f(d)} ${f(c - hw + k * 0.55)},${f(d)}`,
    `L${f(c + hw - k * 0.55)},${f(d)}`,
    // and back up the right shoulder
    `C${f(c + hw + shoulder * 0.12)},${f(d)} ${f(R0 - shoulder * 0.62)},0 ${f(R0)},0`,
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
