<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { isDirty, type Tab } from '../lib/useTabs'
import { labelSink, Spring } from '../lib/liquidTabs'

// Liquid-glass tab bar. A clear glass bar holds the tab names; the active tab
// sits in a well pressed into the glass — a recess with a shadowed upper edge,
// a lit lower lip and a thin mint outline. Picking another tab springs the
// well across; each name lights up as the well arrives under it and dims as
// it leaves, in proportion to the distance, frame by frame.

const props = defineProps<{ tabs: Tab[]; activeId: string | null }>()
const emit = defineEmits<{
  (e: 'activate', id: string): void
  (e: 'close', tab: Tab): void
  (e: 'new'): void
}>()

const BAR_H = 46
const WELL_H = 34
const WELL_EXTRA = 6 // the well is this much wider than the tab it holds

const scroller = ref<HTMLElement>()
const track = ref<HTMLElement>()
const tabEls = new Map<string, HTMLElement>()
function setTabEl(id: string, el: unknown) {
  if (el instanceof HTMLElement) tabEls.set(id, el)
  else tabEls.delete(id)
}

// Measured layout: each tab's centre and width.
const geo = ref<Record<string, { c: number; w: number }>>({})

// The well, animated: centre x and width.
const x = new Spring(0)
const w = new Spring(0)
const pos = ref(0)
const ww = ref(0)

function measure() {
  const g: Record<string, { c: number; w: number }> = {}
  for (const t of props.tabs) {
    const el = tabEls.get(t.id)
    if (el) g[t.id] = { c: el.offsetLeft + el.offsetWidth / 2, w: el.offsetWidth }
  }
  geo.value = g
}

const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
let raf = 0
let last = 0

function target() {
  const g = props.activeId ? geo.value[props.activeId] : undefined
  return g ? { c: g.c, w: g.w + WELL_EXTRA } : null
}

function animate(jump = false) {
  const t = target()
  if (!t) return
  if (jump || reduceMotion || ww.value === 0) {
    x.set(t.c)
    w.set(t.w)
    pos.value = t.c
    ww.value = t.w
    return
  }
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
  ww.value = w.value
  raf = a && b ? 0 : requestAnimationFrame(step)
}

/** Keep the active tab in view when the bar scrolls. */
function reveal() {
  const sc = scroller.value
  const g = props.activeId ? geo.value[props.activeId] : undefined
  if (!sc || !g) return
  const left = g.c - g.w / 2 - 40
  const right = g.c + g.w / 2 + 40
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
  () => props.tabs.map((t) => `${t.id}:${t.name}:${isDirty(t)}:${t.access}`).join('|'),
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

/** How much the well is under a tab right now: 0 = clear of it, 1 = centred on it. */
function lit(id: string): number {
  const g = geo.value[id]
  return g ? labelSink(g.c, g.w, pos.value, ww.value) : 0
}
function tabStyle(id: string) {
  return { '--lit': lit(id).toFixed(3) }
}

const wellStyle = computed(() => ({
  width: `${ww.value}px`,
  transform: `translateX(${(pos.value - ww.value / 2).toFixed(2)}px)`,
}))

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
  <div class="dock" :style="{ '--bar-h': `${BAR_H}px`, '--well-h': `${WELL_H}px` }">
    <div ref="scroller" class="scroller">
      <div ref="track" class="track" role="tablist" aria-label="Open files">
        <!-- The well pressed into the glass under the active tab. -->
        <div v-if="activeId && ww > 0" class="well" :style="wellStyle" aria-hidden="true" />

        <div
          v-for="t in tabs"
          :key="t.id"
          :ref="(el) => setTabEl(t.id, el)"
          class="tab"
          role="tab"
          tabindex="0"
          :aria-selected="t.id === activeId"
          :class="{ dirty: isDirty(t), unlinked: t.access === 'unlinked', current: t.id === activeId }"
          :style="tabStyle(t.id)"
          :title="title(t)"
          @click="$emit('activate', t.id)"
          @keydown="onKey($event, t)"
          @auxclick.middle.prevent="$emit('close', t)"
        >
          <span v-if="t.access === 'needs-access'" class="warn" aria-hidden="true">⚠</span>
          <span class="name">{{ t.name }}</span>
          <button class="x" :aria-label="`Close ${t.name}`" tabindex="-1" @click.stop="$emit('close', t)">
            <span class="dot" aria-hidden="true">●</span>
            <span class="cross" aria-hidden="true">✕</span>
          </button>
        </div>

        <button class="add" aria-label="New tab" title="New file" @click="$emit('new')">+</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dock {
  padding: 0.25rem 0.5rem 0.45rem;
}

/* The bar itself: a pill of clear, faintly smoky glass — sheen along the top,
   milky light collected inside along the bottom edge, bright rim. It scrolls
   sideways when there are many tabs. */
.scroller {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0) 38%),
    radial-gradient(120% 95% at 50% 140%, rgba(255, 246, 236, 0.28), transparent 60%),
    linear-gradient(180deg, rgba(255, 250, 245, 0.02), rgba(255, 250, 245, 0.07)),
    var(--liquid-smoke);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    inset 1px 0 0 rgba(255, 255, 255, 0.14),
    inset -1px 0 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(255, 246, 236, 0.45),
    inset 0 -10px 16px -12px rgba(255, 246, 236, 0.35),
    0 0 0 0.5px rgba(255, 255, 255, 0.2),
    0 8px 18px -8px rgba(0, 0, 0, 0.55);
}
.scroller::-webkit-scrollbar {
  display: none;
}

.track {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 100%;
  width: max-content;
  height: var(--bar-h);
  padding: 0 0.55rem;
}

/* The well: a recess pressed into the glass. Its upper inner edge is in
   shadow, its lower lip catches the light, a thin mint outline traces the
   cut, and a little mint light collects in its floor. */
.well {
  position: absolute;
  left: 0;
  top: calc((var(--bar-h) - var(--well-h)) / 2);
  height: var(--well-h);
  border-radius: 999px;
  background:
    radial-gradient(90% 90% at 50% 125%, hsl(162 72% 66% / 0.3), transparent 62%),
    linear-gradient(180deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.16));
  box-shadow:
    inset 0 2px 5px rgba(0, 0, 0, 0.65),
    inset 0 1px 1px rgba(0, 0, 0, 0.55),
    inset 0 -1px 0 rgba(255, 255, 255, 0.3),
    inset 0 -6px 10px -6px hsl(162 72% 66% / 0.45),
    0 1px 0 rgba(255, 255, 255, 0.22),
    0 0 0 1px hsl(162 72% 66% / 0.5),
    0 0 14px hsl(162 72% 62% / 0.22);
  pointer-events: none;
  will-change: transform, width;
}

/* Tabs: a name lights up as the well arrives under it (--lit, 0 → 1). */
.tab {
  --lit: 0;
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  height: var(--well-h);
  max-width: 15rem;
  padding: 0 0.2rem 0 0.9rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  border-radius: 999px;
  color: color-mix(in srgb, #fff calc(var(--lit) * 100%), var(--text-muted));
  font-size: 0.84rem;
  font-weight: 550;
  text-shadow: 0 0 calc(var(--lit) * 10px) hsl(162 72% 66% / calc(var(--lit) * 0.55));
  transform: translateY(calc(var(--lit) * 1px)); /* pressed in, ever so slightly */
  cursor: pointer;
  user-select: none;
  outline: none;
}
.tab:not(.current):hover {
  color: var(--text);
}
.tab:focus-visible {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.tab.unlinked .name {
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
  opacity: 0.5;
}
.x:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.14);
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
  margin-left: 0.2rem;
  padding: 0 0 1px;
  border: 0;
  border-radius: 50%;
  color: var(--text-muted);
  font-size: 1.1rem;
  font-weight: 400;
  background: linear-gradient(hsl(0 0% 100% / 0.12), hsl(0 0% 100% / 0.02));
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.28),
    0 1px 1px rgba(255, 255, 255, 0.3) inset,
    0 3px 8px rgba(0, 0, 0, 0.35);
  transition:
    color 0.2s,
    box-shadow 0.2s,
    translate 0.15s;
}
.add:hover {
  color: #fff;
  box-shadow:
    0 0 0 1px hsl(162 72% 66% / 0.6),
    0 1px 1px rgba(255, 255, 255, 0.4) inset,
    0 0 12px hsl(162 72% 62% / 0.35);
}
.add:active {
  translate: 0 1px;
}
</style>
