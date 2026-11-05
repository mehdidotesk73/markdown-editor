<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { isDirty, type Tab } from '../lib/useTabs'
import { dentPath, dentSpread, labelSink, Spring } from '../lib/liquidTabs'

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

// Geometry (px). The bubble sits deep in the bar — only its top third rises
// above — and the dent follows its outline at a small gap.
const PAD_TOP = 12 // room above the bar for the bubble
const BAR_H = 48
const BUBBLE_H = 36
const BUBBLE_CY = BUBBLE_H / 2 - PAD_TOP // bubble centre line, relative to the bar's top edge
const GAP = 5 // between bubble and dent
const FILLET = 11 // rounded lip where the dent meets the bar's top edge
const BUBBLE_EXTRA = 8 // bubble is at least this much wider than the tab under it
const BOLD_SLACK = 14 // the bubble's bolder label can run this much wider again
// Tabs sit far enough apart that a neighbour's name clears the dent's lip.
const SPREAD = dentSpread({ bubbleHeight: BUBBLE_H, bubbleCenterY: BUBBLE_CY, gap: GAP, fillet: FILLET })
const TAB_GAP = Math.ceil((BUBBLE_EXTRA + BOLD_SLACK) / 2 + SPREAD + 2)

const scroller = ref<HTMLElement>()
const track = ref<HTMLElement>()
const tabEls = new Map<string, HTMLElement>()
function setTabEl(id: string, el: unknown) {
  if (el instanceof HTMLElement) tabEls.set(id, el)
  else tabEls.delete(id)
}
// Invisible copies of each tab as the bubble would show it (bolder text,
// roomier padding), so the bubble is sized to fit its label, not the tab's.
const ghostEls = new Map<string, HTMLElement>()
function setGhostEl(id: string, el: unknown) {
  if (el instanceof HTMLElement) ghostEls.set(id, el)
  else ghostEls.delete(id)
}

// Measured layout: each tab's centre and width, and the bar's width.
const geo = ref<Record<string, { c: number; w: number; bubble: number }>>({})
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
  const g: Record<string, { c: number; w: number; bubble: number }> = {}
  for (const t of props.tabs) {
    const el = tabEls.get(t.id)
    if (!el) continue
    // Round up and add a hair of slack: an exact fit can tip into an ellipsis at sub-pixel sizes.
    const ghost = Math.ceil(ghostEls.get(t.id)?.getBoundingClientRect().width ?? 0) + 2
    g[t.id] = { c: el.offsetLeft + el.offsetWidth / 2, w: el.offsetWidth, bubble: Math.max(el.offsetWidth + BUBBLE_EXTRA, ghost) }
  }
  geo.value = g
  barW.value = track.value.scrollWidth
}

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
let raf = 0
let last = 0

function target() {
  const g = props.activeId ? geo.value[props.activeId] : undefined
  return g ? { c: g.c, w: g.bubble } : null
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
    bubbleWidth: bw.value,
    bubbleHeight: BUBBLE_H,
    bubbleCenterY: BUBBLE_CY,
    gap: GAP,
    fillet: FILLET,
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
  <div
    class="dock"
    :style="{ '--pad-top': `${PAD_TOP}px`, '--bar-h': `${BAR_H}px`, '--bubble-h': `${BUBBLE_H}px`, '--tab-gap': `${TAB_GAP}px` }"
  >
    <div ref="scroller" class="scroller">
      <div ref="track" class="track" role="tablist" aria-label="Open files">
        <!-- The glass bar, shaped with the dent; then its lit edge. -->
        <div class="bar-glass" :style="{ width: `${barW}px`, clipPath: `path('${barPath}')` }" aria-hidden="true" />
        <svg class="bar-edge" :width="barW" :height="BAR_H" :viewBox="`0 0 ${barW} ${BAR_H}`" aria-hidden="true">
          <defs>
            <linearGradient id="tab-edge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity="0.62" />
              <stop offset="0.5" stop-color="#fff" stop-opacity="0.22" />
              <stop offset="1" stop-color="#fff" stop-opacity="0.6" />
            </linearGradient>
          </defs>
          <path :d="barPath" fill="none" stroke="url(#tab-edge)" stroke-width="1.5" />
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

        <!-- Measuring copies of the bubble, one per tab (never seen). -->
        <div class="ghosts" aria-hidden="true">
          <span v-for="t in tabs" :key="t.id" :ref="(el) => setGhostEl(t.id, el)" class="bubble ghost">
            <span class="bubble-label">
              <span v-if="t.access === 'needs-access'" class="warn">⚠</span>
              <span class="name" :class="{ unlinked: t.access === 'unlinked' }">{{ t.name }}</span>
              <span class="x" />
            </span>
          </span>
        </div>

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
  gap: var(--tab-gap);
  min-width: 100%;
  width: max-content;
  height: calc(var(--pad-top) + var(--bar-h) + 6px);
  /* Side room so the dent's lips never reach the bar's rounded ends. */
  padding: var(--pad-top) 3rem 6px;
}

.bar-glass,
.bar-edge {
  position: absolute;
  left: 0;
  top: var(--pad-top);
  height: var(--bar-h);
  pointer-events: none;
}
/* Smoky glass: a sheen along the top, milky light pooling along the bottom. */
.bar-glass {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 38%),
    radial-gradient(130% 80% at 50% 135%, var(--liquid-milk), transparent 62%),
    linear-gradient(180deg, rgba(255, 250, 245, 0.04), rgba(255, 250, 245, 0.1)),
    var(--liquid-smoke);
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
  padding: 0 0.1rem 0 0.35rem;
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
  background: linear-gradient(hsl(0 0% 100% / 0.12), hsl(0 0% 100% / 0.02)), var(--liquid-smoke);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.32),
    0 1px 2px rgba(255, 255, 255, 0.25) inset,
    0 3px 8px rgba(0, 0, 0, 0.35);
  transition:
    color 0.2s,
    background 0.2s,
    translate 0.15s;
}
.add:hover {
  color: var(--liquid-ink);
  background: linear-gradient(var(--liquid-teal-top), var(--liquid-teal-bottom));
  box-shadow:
    0 0 0 1px var(--liquid-rim),
    0 1px 1px rgba(255, 255, 255, 0.5) inset,
    0 0 14px hsl(162 72% 62% / 0.35);
}
.add:active {
  translate: 0 1px;
}

/* Off-screen measuring copies of the bubble. */
.ghosts {
  position: absolute;
  left: 0;
  top: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}
.bubble.ghost {
  position: static;
  display: inline-flex;
  width: auto;
  max-width: none;
  white-space: nowrap;
}
.bubble.ghost .name {
  overflow: visible;
}

/* The bubble: a drop of deep teal glass — white rim, a soft highlight on
   top, mint light pooling at the bottom and glowing around it. */
.bubble {
  position: absolute;
  z-index: 2;
  left: 0;
  top: 0;
  height: var(--bubble-h);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.35rem 0 1rem;
  border-radius: 999px;
  color: var(--liquid-ink);
  font-size: 0.84rem;
  font-weight: 650;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  background:
    radial-gradient(85% 55% at 50% 0%, hsl(0 0% 100% / 0.32), hsl(0 0% 100% / 0) 70%),
    radial-gradient(90% 70% at 50% 120%, hsl(162 72% 70% / 0.35), transparent 65%),
    linear-gradient(180deg, var(--liquid-teal-top), var(--liquid-teal-bottom));
  backdrop-filter: blur(10px) saturate(160%);
  -webkit-backdrop-filter: blur(10px) saturate(160%);
  box-shadow:
    0 0 0 1px var(--liquid-rim),
    0 1px 1px hsl(0 0% 100% / 0.55) inset,
    0 -5px 10px -4px hsl(162 72% 70% / 0.55) inset,
    0 10px 18px -8px rgba(0, 0, 0, 0.65),
    0 0 20px hsl(162 72% 62% / 0.3);
  will-change: transform, width;
}
.bubble::before {
  /* the mint light it casts down into the dent */
  content: '';
  position: absolute;
  z-index: -1;
  left: 16%;
  right: 16%;
  top: 90%;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(closest-side, hsl(162 72% 66% / 0.55), transparent);
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
  opacity: 0.7;
  pointer-events: auto;
}
.bubble .x:hover {
  background: hsl(0 0% 100% / 0.18);
}
.bubble .x .dot,
.bubble .warn {
  color: hsl(43 100% 66%);
}
</style>
