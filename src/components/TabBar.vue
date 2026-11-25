<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { isDirty, type Tab } from '../lib/useTabs'
import { labelSink, Spring } from '../lib/liquidTabs'
import { dropIndex, slideOf, DRAG_THRESHOLD } from '../lib/tabOrder'
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
  (e: 'reorder', id: string, to: number): void
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

// ---- dragging to reorder (lib/tabOrder.ts) -----------------------------------
//
// Pointer events, for mouse and pen (touch keeps swiping the bar). A press only becomes a drag
// after DRAG_THRESHOLD px, so a click still just picks the tab. The dragged tab
// follows the pointer; the tabs it passes slide one slot to show the gap.

interface Drag {
  id: string
  from: number
  startX: number
  startScroll: number
  pointerId: number
  moving: boolean
}
let drag: Drag | null = null
const dragId = ref<string | null>(null)
const dragOffset = ref(0)
const dragTo = ref(0)
let swallowClick = false

function gapPx(): number {
  return track.value ? parseFloat(getComputedStyle(track.value).columnGap) || 0 : 0
}

function onPointerDown(e: PointerEvent, t: Tab) {
  // Mouse and pen only: on touch, a sideways swipe keeps scrolling the bar.
  if (e.pointerType === 'touch' || e.button !== 0 || (e.target as HTMLElement).closest('.x')) return
  drag = {
    id: t.id,
    from: props.tabs.findIndex((x) => x.id === t.id),
    startX: e.clientX,
    startScroll: scroller.value?.scrollLeft ?? 0,
    pointerId: e.pointerId,
    moving: false,
  }
}

function onPointerMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return
  const sc = scroller.value
  if (!drag.moving) {
    if (Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD) return
    drag.moving = true
    dragId.value = drag.id
    dragTo.value = drag.from
    tabEls.get(drag.id)?.setPointerCapture(e.pointerId)
  }
  // Near an edge of a bar that scrolls: scroll it along.
  if (sc) {
    const r = sc.getBoundingClientRect()
    if (e.clientX < r.left + 28) sc.scrollLeft -= 12
    else if (e.clientX > r.right - 28) sc.scrollLeft += 12
  }
  dragOffset.value = e.clientX - drag.startX + ((sc?.scrollLeft ?? 0) - drag.startScroll)
  const centres = props.tabs.map((t) => geo.value[t.id]?.c ?? 0)
  const g = geo.value[drag.id] ?? { c: 0, w: 0 }
  const centre = g.c + dragOffset.value
  dragTo.value = dropIndex(centres, drag.from, centre - g.w / 2, centre + g.w / 2)
}

function endDrag(e: PointerEvent, cancelled = false) {
  if (!drag || e.pointerId !== drag.pointerId) return
  const d = drag
  drag = null
  if (!d.moving) return
  swallowClick = true // the click that follows this release isn't a pick
  // Start the well from where the active tab is now, so it settles smoothly.
  if (props.activeId) {
    x.set(liveCentre(props.activeId))
    pos.value = x.value
  }
  const to = dragTo.value
  dragId.value = null
  dragOffset.value = 0
  if (!cancelled && to !== d.from) emit('reorder', d.id, to)
}

function onTabClick(t: Tab) {
  if (swallowClick) {
    swallowClick = false
    return
  }
  emit('activate', t.id)
}

/** How far a tab is drawn from its place right now: following the pointer, or sliding aside. */
function shiftOf(id: string): number {
  if (!dragId.value) return 0
  if (id === dragId.value) return dragOffset.value
  const from = props.tabs.findIndex((t) => t.id === dragId.value)
  const k = props.tabs.findIndex((t) => t.id === id)
  const slot = (geo.value[dragId.value]?.w ?? 0) + gapPx()
  return slideOf(k, from, dragTo.value) * slot
}
function liveCentre(id: string): number {
  return (geo.value[id]?.c ?? 0) + shiftOf(id)
}

/** Ctrl/⌘+Shift+← / → moves the focused tab one place. */
async function moveByKey(e: KeyboardEvent, t: Tab): Promise<boolean> {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return false
  e.preventDefault()
  const from = props.tabs.findIndex((x) => x.id === t.id)
  const to = from + (e.key === 'ArrowLeft' ? -1 : 1)
  if (to < 0 || to >= props.tabs.length) return true
  emit('reorder', t.id, to)
  await nextTick()
  tabEls.get(t.id)?.focus() // moving the element can drop its focus
  return true
}

// ---- what the template draws -------------------------------------------------

/** How much the well is under a tab right now: 0 = clear of it, 1 = centred on it. */
function lit(id: string): number {
  const g = geo.value[id]
  if (!g) return 0
  const wellAt = dragId.value && props.activeId ? liveCentre(props.activeId) : pos.value
  return labelSink(liveCentre(id), g.w, wellAt, ww.value)
}
function tabStyle(id: string) {
  const shift = shiftOf(id)
  return { '--lit': lit(id).toFixed(3), ...(shift ? { transform: `translateX(${shift.toFixed(1)}px)` } : {}) }
}

const wellStyle = computed(() => {
  // While dragging, the well rides with the active tab (dragged or sliding aside).
  const c = dragId.value && props.activeId ? liveCentre(props.activeId) : pos.value
  return { width: `${ww.value}px`, transform: `translateX(${(c - ww.value / 2).toFixed(2)}px)` }
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

async function onKey(e: KeyboardEvent, t: Tab) {
  if (await moveByKey(e, t)) return
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
          :class="{ dirty: isDirty(t), unlinked: t.access === 'unlinked', current: t.id === activeId, dragged: t.id === dragId, sliding: !!dragId && t.id !== dragId }"
          :style="tabStyle(t.id)"
          :title="title(t)"
          @click="onTabClick(t)"
          @pointerdown="onPointerDown($event, t)"
          @pointermove="onPointerMove"
          @pointerup="endDrag($event)"
          @pointercancel="endDrag($event, true)"
          @lostpointercapture="endDrag($event)"
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
/* Dragging: the picked-up tab rides above the others, which slide aside. */
.tab.dragged {
  z-index: 2;
  cursor: grabbing;
  background: var(--btn-bg-hover);
  box-shadow:
    0 0 0 1px var(--btn-border-hover),
    0 3px 10px rgba(var(--shadow-rgb), 0.25);
}
.tab.sliding {
  transition: transform 0.15s ease;
}
@media (prefers-reduced-motion: reduce) {
  .tab.sliding {
    transition: none;
  }
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

/* Unsaved: the tab's name turns amber (full amber when active, a little
   softer when not), instead of a dot or an outline. */
.tab.dirty,
.tab.dirty:not(.current):hover {
  color: color-mix(in srgb, var(--warn) calc(70% + var(--lit) * 30%), var(--text-muted));
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
