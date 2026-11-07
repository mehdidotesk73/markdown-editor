<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { isDirty, type Tab } from '../lib/useTabs'
import { labelSink, Spring } from '../lib/liquidTabs'
import { Plus, X } from '@lucide/vue'

// Matte tab bar, in the same style as the buttons (UiButton): a flat bar with a
// hairline border; the active tab sits on a flat raised fill (the "well").
// Picking another tab springs the fill across; each name brightens as the fill
// arrives under it and dims as it leaves, in proportion to the distance.

const props = defineProps<{ tabs: Tab[]; activeId: string | null }>()
const emit = defineEmits<{
  (e: 'activate', id: string): void
  (e: 'close', tab: Tab): void
  (e: 'new'): void
}>()

const BAR_H = 32
const WELL_H = 24
const WELL_EXTRA = 4 // the well is this much wider than the tab it holds

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
        <!-- The flat fill under the active tab. -->
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
            <X class="cross" aria-hidden="true" />
          </button>
        </div>

        <button class="add" aria-label="New tab" title="New file" @click="$emit('new')"><Plus class="plus" aria-hidden="true" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dock {
  padding: 0.2rem 0.5rem 0.35rem;
}

/* The bar: flat, with a hairline border, like the buttons. It scrolls
   sideways when there are many tabs. */
.scroller {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  border: 1px solid var(--btn-border);
  border-radius: calc(var(--btn-radius) + 0.15rem);
  background: var(--bg-elev);
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
  height: var(--bar-h);
  padding: 0 0.2rem;
}

/* The active tab's fill: a matte button surface that springs between tabs. */
.well {
  position: absolute;
  left: 0;
  top: calc((var(--bar-h) - var(--well-h)) / 2 - 1px);
  height: var(--well-h);
  border: 1px solid var(--btn-border-hover);
  border-radius: var(--btn-radius);
  background: var(--btn-bg-hover);
  pointer-events: none;
  will-change: transform, width;
}

/* Tabs: a name brightens as the fill arrives under it (--lit, 0 → 1). */
.tab {
  --lit: 0;
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  height: var(--well-h);
  max-width: 15rem;
  padding: 0 0.1rem 0 0.65rem;
  display: flex;
  align-items: center;
  gap: 0.2rem;
  border-radius: var(--btn-radius);
  color: color-mix(in srgb, var(--text) calc(var(--lit) * 100%), var(--text-muted));
  font-size: 0.8rem;
  font-weight: 550;
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
  font-size: 0.75rem;
}

/* Unsaved: the tab gets an amber outline (no dot). */
.tab.dirty {
  box-shadow: inset 0 0 0 1px var(--warn);
}

/* Close: a small ✕, brighter on hover. */
.x {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  padding: 0;
  border: 0;
  border-radius: calc(var(--btn-radius) - 0.1rem);
  background: none;
  color: inherit;
  opacity: 0.5;
}
.x:hover {
  opacity: 1;
  background: var(--btn-bg-press);
}
.x .cross {
  width: 0.8rem;
  height: 0.8rem;
  stroke-width: 2;
}
.add .plus {
  width: 0.95rem;
  height: 0.95rem;
  stroke-width: 1.75;
}

/* New tab: a small square matte button. */
.add {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: var(--well-h);
  height: var(--well-h);
  margin-left: 0.1rem;
  padding: 0 0 1px;
  border: 1px solid var(--btn-border);
  border-radius: var(--btn-radius);
  background: var(--btn-bg);
  color: var(--text-muted);
  font-size: 0.95rem;
  font-weight: 400;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}
.add:hover {
  color: var(--text);
  background: var(--btn-bg-hover);
  border-color: var(--btn-border-hover);
}
.add:active {
  background: var(--btn-bg-press);
}
.add:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 2px;
}
</style>
