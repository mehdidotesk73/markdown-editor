<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { isDirty, type Tab } from '../lib/useTabs'
import { dentPath, labelSink, Spring } from '../lib/liquidTabs'

// Liquid-glass tab bar. A frosted glass bar holds the tab names; the active
// tab rides in a glass bubble floating above the bar, which presses a dent
// into the bar's top edge. Picking another tab springs the bubble across and
// the dent travels with it. Each name in the bar sinks and fades as the
// bubble comes over it, and rises back as the bubble moves away: in
// proportion to the distance, frame by frame (see lib/liquidTabs.ts).

const props = defineProps<{ tabs: Tab[]; activeId: string | null }>()
const emit = defineEmits<{
  (e: 'activate', id: string): void
  (e: 'close', tab: Tab): void
  (e: 'new'): void
}>()

// Geometry (px). The bubble sits half above the bar; the dent hugs its bottom.
const PAD_TOP = 17 // room above the bar for the bubble
const BAR_H = 42
const BUBBLE_H = 34
const BUBBLE_Y = 0 // bubble top, from the top of the track
const GAP = 5 // between bubble and dent
const DENT_DEPTH = BUBBLE_Y + BUBBLE_H - PAD_TOP + GAP // dent bottom, below bar top
const BUBBLE_EXTRA = 10 // bubble is this much wider than the tab under it

const scroller = ref<HTMLElement>()
const track = ref<HTMLElement>()
const tabEls = new Map<string, HTMLElement>()
function setTabEl(id: string, el: unknown) {
  if (el instanceof HTMLElement) tabEls.set(id, el)
  else tabEls.delete(id)
}

// Measured layout: each tab's centre and width, and the bar's width.
const geo = ref<Record<string, { c: number; w: number }>>({})
const barW = ref(0)

// Animated bubble: centre x and width.
const x = new Spring(0)
const w = new Spring(0)
const pos = ref(0)
const bw = ref(0)
let from = 0 // where the current move started, for the bubble label's fade-in

const active = computed(() => props.tabs.find((t) => t.id === props.activeId) ?? null)

function measure() {
  if (!track.value) return
  const g: Record<string, { c: number; w: number }> = {}
  for (const t of props.tabs) {
    const el = tabEls.get(t.id)
    if (el) g[t.id] = { c: el.offsetLeft + el.offsetWidth / 2, w: el.offsetWidth }
  }
  geo.value = g
  barW.value = track.value.scrollWidth
}

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
let raf = 0
let last = 0

function target() {
  const g = props.activeId ? geo.value[props.activeId] : undefined
  return g ? { c: g.c, w: g.w + BUBBLE_EXTRA } : null
}

function animate(jump = false) {
  const t = target()
  if (!t) return
  if (jump || reduceMotion || bw.value === 0) {
    x.set(t.c)
    w.set(t.w)
    pos.value = t.c
    bw.value = t.w
    from = t.c
    return
  }
  from = pos.value
  x.target = t.c
  w.target = t.w
  if (!raf) {
    last = performance.now()
    raf = requestAnimationFrame(step)
  }
}

function step(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 30)
  last = now
  const a = x.step(dt)
  const b = w.step(dt)
  pos.value = x.value
  bw.value = w.value
  raf = a && b ? 0 : requestAnimationFrame(step)
}

/** Keep the active tab in view when the bar scrolls. */
function reveal() {
  const sc = scroller.value
  const g = props.activeId ? geo.value[props.activeId] : undefined
  if (!sc || !g) return
  const left = g.c - g.w / 2 - 60
  const right = g.c + g.w / 2 + 60
  if (left < sc.scrollLeft) sc.scrollTo({ left, behavior: 'smooth' })
  else if (right > sc.scrollLeft + sc.clientWidth) sc.scrollTo({ left: right - sc.clientWidth, behavior: 'smooth' })
}

async function relayout(jump = false) {
  await nextTick()
  measure()
  animate(jump)
  reveal()
}

watch(() => props.activeId, () => relayout())
watch(
  () => props.tabs.map((t) => `${t.id}:${t.name}:${isDirty(t)}`).join('|'),
  () => relayout(),
)

let ro: ResizeObserver | undefined
onMounted(() => {
  relayout(true)
  ro = new ResizeObserver(() => {
    measure()
    animate(true)
  })
  if (track.value) ro.observe(track.value)
  // Web fonts can change text widths after first paint.
  document.fonts?.ready.then(() => relayout(true))
})
onBeforeUnmount(() => {
  ro?.disconnect()
  cancelAnimationFrame(raf)
})

// ---- what the template draws -------------------------------------------------

const barPath = computed(() =>
  dentPath({
    width: barW.value,
    height: BAR_H,
    center: pos.value,
    halfWidth: bw.value / 2 + GAP,
    depth: DENT_DEPTH,
  }),
)

/** How far a tab's name has sunk under the bubble: 0 = in place, 1 = gone. */
function sink(id: string): number {
  const g = geo.value[id]
  return g ? labelSink(g.c, g.w, pos.value, bw.value) : 0
}
function labelStyle(id: string) {
  const k = sink(id)
  return {
    opacity: String(1 - k),
    transform: `translateY(${(k * 11).toFixed(2)}px) scale(${(1 - 0.28 * k).toFixed(3)})`,
    filter: k > 0.02 ? `blur(${(k * 1.5).toFixed(2)}px)` : undefined,
  }
}

/** The bubble's own label rises in as the bubble arrives. */
const arrival = computed(() => {
  const t = target()
  if (!t) return 1
  const span = Math.abs(t.c - from)
  if (span < 1) return 1
  return Math.max(0, Math.min(1, 1 - Math.abs(t.c - pos.value) / span))
})

const bubbleStyle = computed(() => ({
  width: `${bw.value}px`,
  transform: `translateX(${(pos.value - bw.value / 2).toFixed(2)}px)`,
}))
const bubbleLabelStyle = computed(() => {
  const k = arrival.value ** 1.6
  return { opacity: String(k), transform: `translateY(${((1 - k) * 8).toFixed(2)}px) scale(${(0.86 + 0.14 * k).toFixed(3)})` }
})

function title(t: Tab): string {
  const where =
    t.access === 'linked'
      ? 'Linked to a file on this computer'
      : t.access === 'needs-access'
        ? 'Linked — click Reconnect to allow access again'
        : 'Not saved to a file yet'
  return `${t.name}\n${where}${isDirty(t) ? '\nUnsaved changes' : ''}`
}

function onKey(e: KeyboardEvent, t: Tab) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('activate', t.id)
  }
}
</script>

<template>
  <div class="dock" :style="{ '--pad-top': `${PAD_TOP}px`, '--bar-h': `${BAR_H}px`, '--bubble-h': `${BUBBLE_H}px` }">
    <div ref="scroller" class="scroller">
      <div ref="track" class="track" role="tablist" aria-label="Open files">
        <!-- The glass bar, shaped with the dent; then its lit edge. -->
        <div class="bar-glass" :style="{ width: `${barW}px`, clipPath: `path('${barPath}')` }" aria-hidden="true" />
        <svg class="bar-edge" :width="barW" :height="BAR_H" :viewBox="`0 0 ${barW} ${BAR_H}`" aria-hidden="true">
          <defs>
            <linearGradient id="tab-edge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
              <stop offset="0.45" stop-color="#fff" stop-opacity="0.08" />
              <stop offset="1" stop-color="#fff" stop-opacity="0.22" />
            </linearGradient>
          </defs>
          <path :d="barPath" fill="none" stroke="url(#tab-edge)" stroke-width="1.2" />
        </svg>

        <div
          v-for="t in tabs"
          :key="t.id"
          :ref="(el) => setTabEl(t.id, el)"
          class="tab"
          role="tab"
          tabindex="0"
          :aria-selected="t.id === activeId"
          :class="{ dirty: isDirty(t), unlinked: t.access === 'unlinked' }"
          :title="title(t)"
          @click="$emit('activate', t.id)"
          @keydown="onKey($event, t)"
          @auxclick.middle.prevent="$emit('close', t)"
        >
          <span class="tab-inner" :style="labelStyle(t.id)">
            <span v-if="t.access === 'needs-access'" class="warn" aria-hidden="true">⚠</span>
            <span class="name">{{ t.name }}</span>
            <button class="x" :aria-label="`Close ${t.name}`" tabindex="-1" @click.stop="$emit('close', t)">
              <span class="dot" aria-hidden="true">●</span>
              <span class="cross" aria-hidden="true">✕</span>
            </button>
          </span>
        </div>

        <button class="add" aria-label="New tab" title="New file" @click="$emit('new')">+</button>

        <!-- The bubble carrying the active tab. -->
        <div v-if="active && bw > 0" class="bubble" :class="{ dirty: isDirty(active) }" :style="bubbleStyle" aria-hidden="true">
          <span class="bubble-label" :style="bubbleLabelStyle">
            <span v-if="active.access === 'needs-access'" class="warn">⚠</span>
            <span class="name" :class="{ unlinked: active.access === 'unlinked' }">{{ active.name }}</span>
            <button class="x" tabindex="-1" @click.stop="$emit('close', active)">
              <span class="dot">●</span>
              <span class="cross">✕</span>
            </button>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dock {
  padding: 0 0.5rem 0.4rem;
}

/* Scrolls sideways when there are many tabs; tall enough that the bubble,
   which rises above the bar, is never clipped. */
.scroller {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.scroller::-webkit-scrollbar {
  display: none;
}

.track {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.2rem;
  min-width: 100%;
  width: max-content;
  height: calc(var(--pad-top) + var(--bar-h) + 6px);
  /* Side room so the dent's shoulders never reach the bar's rounded ends. */
  padding: var(--pad-top) 2.9rem 6px;
}

.bar-glass,
.bar-edge {
  position: absolute;
  left: 0;
  top: var(--pad-top);
  height: var(--bar-h);
  pointer-events: none;
}
.bar-glass {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.04) 55%, rgba(255, 255, 255, 0.08)),
    rgba(20, 27, 42, 0.35);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
}
.bar-edge {
  overflow: visible;
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.35));
}

.tab {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  height: var(--bar-h);
  max-width: 15rem;
  padding: 0 0.15rem 0 0.8rem;
  display: flex;
  align-items: center;
  border-radius: 999px;
  color: var(--text-muted);
  font-size: 0.84rem;
  cursor: pointer;
  user-select: none;
  outline: none;
}
.tab-inner {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  transform-origin: 50% 100%;
  will-change: transform, opacity;
}
.tab:hover .tab-inner {
  color: var(--text);
}
.tab:focus-visible .tab-inner {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.tab.unlinked .name,
.bubble .name.unlinked {
  font-style: italic;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.warn {
  color: var(--warn);
  font-size: 0.78rem;
}

/* Close / unsaved: an amber dot that turns into ✕ on hover. */
.x {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: inherit;
  font-size: 0.66rem;
  opacity: 0.55;
}
.x:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.16);
}
.x .dot,
.x .cross {
  grid-area: 1 / 1;
}
.x .dot {
  display: none;
  color: var(--warn);
}
.dirty .x {
  opacity: 1;
}
.dirty .x .dot {
  display: block;
}
.dirty .x .cross {
  display: none;
}
.dirty .x:hover .dot {
  display: none;
}
.dirty .x:hover .cross {
  display: block;
}

.add {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  margin-left: 0.3rem;
  padding: 0 0 1px;
  border: 0;
  border-radius: 50%;
  color: var(--text-muted);
  font-size: 1.1rem;
  font-weight: 400;
  background: linear-gradient(hsl(0 0% 100% / 0.12), hsl(0 0% 100% / 0.02));
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.14),
    0 1px 2px rgba(255, 255, 255, 0.25) inset,
    0 3px 8px rgba(0, 0, 0, 0.35);
  transition:
    color 0.2s,
    background 0.2s,
    translate 0.15s;
}
.add:hover {
  color: var(--text);
  background: linear-gradient(hsl(217 92% 70% / 0.35), hsl(217 92% 60% / 0.12));
}
.add:active {
  translate: 0 1px;
}

/* The bubble: a raised drop of tinted glass with a specular highlight. */
.bubble {
  position: absolute;
  z-index: 2;
  left: 0;
  top: 0;
  height: var(--bubble-h);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.3rem 0 0.95rem;
  border-radius: 999px;
  color: hsl(217 100% 97%);
  font-size: 0.84rem;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  background:
    radial-gradient(120% 90% at 50% 0%, hsl(0 0% 100% / 0.32), transparent 55%),
    linear-gradient(180deg, hsl(217 92% 66% / 0.55), hsl(217 92% 46% / 0.42));
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  box-shadow:
    0 0 0 1px hsl(217 92% 80% / 0.45),
    0 0.12em 0.2em hsl(0 0% 100% / 0.55) inset,
    0 -0.4em 0.9em -0.2em hsl(200 100% 80% / 0.45) inset,
    0 10px 18px -6px rgba(0, 0, 0, 0.6),
    0 0 18px hsl(217 92% 65% / 0.35);
  will-change: transform, width;
}
.bubble::before {
  /* the glow it casts down into the dent */
  content: '';
  position: absolute;
  z-index: -1;
  left: 18%;
  right: 18%;
  top: 92%;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(closest-side, hsl(217 92% 70% / 0.5), transparent);
  filter: blur(2px);
}
.bubble-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  max-width: 100%;
  transform-origin: 50% 100%;
}
.bubble .x {
  opacity: 0.8;
  pointer-events: auto;
}
.bubble .x .dot {
  color: hsl(43 96% 68%);
}
</style>
