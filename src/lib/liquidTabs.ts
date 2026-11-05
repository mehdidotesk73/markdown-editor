// Motion for the liquid-glass tab bar (components/TabBar.vue): how much the
// moving well lights each tab, and the spring that moves it. Pure, no DOM, so
// they're unit-tested.

/**
 * How much the moving well is under a tab: 0 when it's clear of the tab,
 * rising smoothly to 1 when it's centred on it.
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
