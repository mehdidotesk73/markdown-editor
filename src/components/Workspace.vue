<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { renderMarkdown } from '../lib/markdown'
import { hydrateDiagrams } from '../lib/diagram'
import { hydrateCode } from '../lib/highlight'
import { useTheme } from '../lib/useTheme'
import type { Tab } from '../lib/useTabs'
import UiButton from './ui/UiButton.vue'
import FocusControls from './FocusControls.vue'
import { indentEdit } from '../lib/indent'
import { getView, saveView, clampSelection } from '../lib/tabView'
import { edgeOf, editorLineAt, previewTopOf, scrollFor, segmentAtLine, wordFractionAt, wordMiddleAt } from '../lib/scrollSync'
import { editorMetrics, editorWordBoxes, previewAnchors, previewWordBoxes } from '../lib/scrollSyncDom'
import { FolderOpen, Minus, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plug, Plus } from '@lucide/vue'
import { previewZoom, stepZoom, ZOOM_STEPS } from '../lib/previewZoom'
import { useFocusShadow } from '../lib/focus/useFocusShadow'

// The split view for one tab: markdown source on the left, rendered preview
// on the right. Either side collapses to a thin rail — collapse the editor to
// read, collapse the preview to write. One side is always open.

const props = defineProps<{ tab: Tab }>()
defineEmits<{ (e: 'reconnect'): void; (e: 'relink'): void }>()


// ---- layout (a per-viewer convenience, so localStorage is fine) ------------

const LAYOUT_KEY = 'md-editor:layout'
interface Layout {
  editor: boolean
  preview: boolean
  split: number // editor's share of the width, 0.2 – 0.8
}
function loadLayout(): Layout {
  try {
    const l = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '') as Layout
    if (typeof l.split === 'number' && (l.editor || l.preview)) return l
  } catch {
    /* first visit, or storage blocked */
  }
  return { editor: true, preview: true, split: 0.5 }
}
const layout = ref<Layout>(loadLayout())
watch(
  layout,
  (l) => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(l))
    } catch {
      /* ignore */
    }
  },
  { deep: true },
)

function toggleEditor() {
  layout.value.editor = !layout.value.editor
  if (!layout.value.editor) layout.value.preview = true
}
function togglePreview() {
  layout.value.preview = !layout.value.preview
  if (!layout.value.preview) layout.value.editor = true
}

defineExpose({ toggleEditor, togglePreview, layout })

const both = computed(() => layout.value.editor && layout.value.preview)
const gridColumns = computed(() => {
  const l = layout.value
  if (both.value) return `minmax(0, ${l.split}fr) auto minmax(0, ${1 - l.split}fr)`
  return l.editor ? 'minmax(0, 1fr) auto var(--rail)' : 'var(--rail) auto minmax(0, 1fr)'
})

// ---- draggable divider -----------------------------------------------------

const root = ref<HTMLElement>()
const dragging = ref(false)
function startDrag(e: PointerEvent) {
  if (!both.value) return
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onDrag(e: PointerEvent) {
  if (!dragging.value || !root.value) return
  const r = root.value.getBoundingClientRect()
  const ratio = (e.clientX - r.left) / r.width
  layout.value.split = Math.min(0.8, Math.max(0.2, ratio))
}
function endDrag() {
  dragging.value = false
}

// ---- editor ----------------------------------------------------------------

const textarea = ref<HTMLTextAreaElement>()
const preview = ref<HTMLElement>()

const html = computed(() => renderMarkdown(props.tab.content))

// Mermaid diagrams: the preview HTML carries placeholders; draw them after
// each render, and again when the look changes (they take the look's colours).
// Code blocks with a language get coloured once their grammar has loaded.
const { theme: look } = useTheme()
watch(
  [html, () => look.value.id, preview],
  () => {
    if (!preview.value) return
    void hydrateDiagrams(preview.value)
    void hydrateCode(preview.value)
  },
  { flush: 'post', immediate: true },
)
const words = computed(() => (props.tab.content.match(/\S+/g) ?? []).length)

// The focus shadow: trails the cursor and underlines its span in the preview.
const { supported: shadowSupported, frame: focusFrame } = useFocusShadow({
  tabId: computed(() => props.tab.id),
  text: computed(() => props.tab.content),
  html,
  textarea,
  preview,
})

// Tab inserts two spaces instead of leaving the editor. execCommand keeps the
// browser's undo history intact; setRangeText is the fallback.
// Tab / Shift+Tab: indent or outdent the selected lines (or insert an indent
// at the cursor). Goes through execCommand so it lands on the undo stack.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return
  e.preventDefault()
  const ta = e.target as HTMLTextAreaElement
  const edit = indentEdit(ta.value, ta.selectionStart, ta.selectionEnd, e.shiftKey)
  if (edit.from === edit.to && !edit.insert) return
  ta.setSelectionRange(edit.from, edit.to)
  const ok = edit.insert
    ? document.execCommand('insertText', false, edit.insert)
    : document.execCommand('delete')
  if (!ok) ta.setRangeText(edit.insert, edit.from, edit.to, 'end')
  ta.setSelectionRange(edit.selStart, edit.selEnd)
  props.tab.content = ta.value
}

function onInput(e: Event) {
  props.tab.content = (e.target as HTMLTextAreaElement).value
  rememberSelection()
}

// ---- where each file was left (lib/tabView.ts) -------------------------------

// While a tab's position is being put back, scroll events are ours: don't
// record them, and don't let the editor's scroll drag the preview along.
let restoring = false

function rememberSelection() {
  const ta = textarea.value
  if (ta && !restoring) saveView(props.tab.id, { selStart: ta.selectionStart, selEnd: ta.selectionEnd })
}

function onPreviewScroll() {
  if (!preview.value || restoring) return
  saveView(props.tab.id, { previewTop: preview.value.scrollTop })
}

/** Put the cursor and both panes back where this tab was left (top, the first time). */
async function restoreView() {
  restoring = true
  await nextTick()
  const v = getView(props.tab.id)
  const ta = textarea.value
  if (ta) {
    const [s, e] = v ? clampSelection(v, ta.value.length) : [0, 0]
    ta.setSelectionRange(s, e) // doesn't move focus
    ta.scrollTop = v?.editorTop ?? 0
  }
  if (preview.value) preview.value.scrollTop = v?.previewTop ?? 0
  // Let the scroll events from the lines above pass before recording again.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (preview.value && v) preview.value.scrollTop = v.previewTop
      restoring = false
    }),
  )
}

// ---- keeping the preview level with the editor (lib/scrollSync.ts) ----------
//
// The editor leads; the preview follows it but can be scrolled freely on its
// own (the user's choice) — the next scroll or edit in the editor brings it
// back. Both map onto source lines: the editor by measuring where each line
// starts (wrapped lines are taller), the preview by the data-line each rendered
// block carries. Within a block they match by word: the word at the editor's
// middle is, say, 70% of the way through its block's words; the preview is
// centred on the word 70% through the same block.

// A zoom change moves every block: put the preview back level with the editor.
watch(previewZoom, () => void nextTick(() => requestAnimationFrame(syncPreview)))

function syncPreview() {
  const ta = textarea.value
  const pv = preview.value
  if (!ta || !pv || !both.value || restoring) return
  const ed = editorMetrics(ta)
  const anchors = previewAnchors(pv, ed.tops.length)
  const y = ta.scrollTop + ta.clientHeight / 2
  const line = editorLineAt(ed.tops, y, ed.height)
  const i = segmentAtLine(anchors, line)
  let target = previewTopOf(anchors, line) // no words to go by: spread the lines over the block
  const block = anchors[i]
  if (block.el) {
    const end = anchors[i + 1]?.line ?? ed.tops.length
    const p = wordFractionAt(editorWordBoxes(ta, ed, block.line, end), y)
    const at = p === null ? null : wordMiddleAt(previewWordBoxes(pv, block.el as HTMLElement), p)
    if (at !== null) target = at
  }
  pv.scrollTop = scrollFor(target, pv.clientHeight, pv.scrollHeight, edgeOf(ta.scrollTop, ta.clientHeight, ta.scrollHeight))
}

function syncScroll() {
  const ta = textarea.value
  if (!ta || restoring) return
  saveView(props.tab.id, { editorTop: ta.scrollTop })
  syncPreview()
}

// The preview's height changes as you type (and when a diagram is drawn): keep it level.
watch(html, () => requestAnimationFrame(syncPreview), { flush: 'post' })

// Switching tabs (or opening the workspace) → back to where that file was left.
watch(() => props.tab.id, () => void restoreView(), { immediate: true })
// A pane that was collapsed comes back as a new element: put it back in place too.
watch([textarea, preview], ([ta, pv], [oldTa, oldPv]) => {
  if ((ta && !oldTa) || (pv && !oldPv)) void restoreView()
})

onBeforeUnmount(endDrag)
</script>

<template>
  <section class="workspace">
    <div v-if="tab.access === 'needs-access'" class="banner" role="status">
      <span class="banner-mark" aria-hidden="true">⚠</span>
      <span>
        <strong>{{ tab.name }}</strong> was open last time. Allow access again to save it and
        pick up changes made outside the editor.
      </span>
      <UiButton size="compact" tone="attention" :icon-left="Plug" @click="$emit('reconnect')">Reconnect</UiButton>
      <UiButton
        size="compact"
        :icon-left="FolderOpen"
        title="If Reconnect doesn't work: pick the file again (your unsaved edits are kept)"
        @click="$emit('relink')"
      >
        Choose file…
      </UiButton>
    </div>

    <div
      ref="root"
      class="panes"
      :class="{ dragging, 'editor-closed': !layout.editor, 'preview-closed': !layout.preview }"
      :style="{ '--cols': gridColumns }"
    >
      <!-- Editor -->
      <div v-if="layout.editor" class="pane editor-pane">
        <header class="pane-head">
          <span class="pane-title">Markdown</span>
          <span class="pane-meta">{{ words }} {{ words === 1 ? 'word' : 'words' }}</span>
          <UiButton
            size="compact"
            :icon-left="PanelLeftClose"
            aria-label="Collapse editor (read focus)"
            title="Collapse editor — read focus"
            @click="toggleEditor"
          />
        </header>
        <textarea
          ref="textarea"
          class="source"
          :value="tab.content"
          spellcheck="true"
          placeholder="# Start writing…"
          aria-label="Markdown source"
          @input="onInput"
          @select="rememberSelection"
          @keyup="rememberSelection"
          @mouseup="rememberSelection"
          @keydown="onKeydown"
          @scroll="syncScroll"
        />
      </div>
      <button v-else class="rail" title="Show editor" aria-label="Show editor" @click="toggleEditor">
        <PanelLeftOpen class="rail-icon" aria-hidden="true" />
        <span class="rail-label">Markdown</span>
      </button>

      <div
        class="divider"
        :class="{ inert: !both }"
        role="separator"
        aria-orientation="vertical"
        @pointerdown="startDrag"
        @pointermove="onDrag"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @dblclick="layout.split = 0.5"
      />

      <!-- Preview -->
      <div v-if="layout.preview" class="pane preview-pane">
        <!-- Collapse button on the inner edge, mirroring the editor's. -->
        <header class="pane-head preview-head">
          <UiButton
            size="compact"
            :icon-left="PanelRightClose"
            aria-label="Collapse preview (edit focus)"
            title="Collapse preview — edit focus"
            @click="togglePreview"
          />
          <span class="pane-title">Preview</span>
          <span class="pane-meta" />
          <div class="zoom" role="group" aria-label="Preview text size">
            <UiButton
              size="compact"
              :icon-left="Minus"
              aria-label="Smaller text"
              title="Smaller text"
              :disabled="previewZoom <= ZOOM_STEPS[0]"
              @click="previewZoom = stepZoom(previewZoom, -1)"
            />
            <select v-model.number="previewZoom" aria-label="Preview zoom" title="Preview text size">
              <option v-for="z in ZOOM_STEPS" :key="z" :value="z">{{ z }}%</option>
            </select>
            <UiButton
              size="compact"
              :icon-left="Plus"
              aria-label="Larger text"
              title="Larger text"
              :disabled="previewZoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]"
              @click="previewZoom = stepZoom(previewZoom, 1)"
            />
          </div>
          <FocusControls :supported="shadowSupported" :count="focusFrame?.count ?? 0" />
        </header>
        <div
          ref="preview"
          class="preview-scroll"
          tabindex="-1"
          @scroll="onPreviewScroll"
        >
          <!-- eslint-disable-next-line vue/no-v-html — sanitized by DOMPurify in lib/markdown.ts -->
          <article class="md-body" :style="{ fontSize: `${previewZoom / 100}rem` }" v-html="html" />
          <p v-if="!tab.content.trim()" class="empty-preview">Nothing to preview yet.</p>
        </div>
      </div>
      <button v-else class="rail" title="Show preview" aria-label="Show preview" @click="togglePreview">
        <PanelRightOpen class="rail-icon" aria-hidden="true" />
        <span class="rail-label">Preview</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.5rem 0.5rem 0;
  padding: 0.45rem 0.6rem;
  border: 1px solid color-mix(in srgb, var(--warn) 50%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--warn) 9%, var(--bg-elev));
  font-size: 0.85rem;
}
.banner > span:nth-child(2) {
  flex: 1;
}
.banner-mark {
  color: var(--warn);
}

.panes {
  --rail: 2.2rem;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--cols);
  grid-template-rows: minmax(0, 1fr);
  padding: 0.5rem;
  gap: 0;
}
.panes.dragging {
  cursor: col-resize;
  user-select: none;
}

.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--paper-bg);
  color: var(--paper-text);
  border: 1px solid var(--paper-border);
  border-radius: var(--radius);
  overflow: hidden;
}

.pane-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: 2.5rem;
  padding: 0 0.35rem 0 0.8rem;
  border-bottom: 1px solid var(--paper-border);
  background: var(--paper-head);
}
/* Collapse buttons sit on the paper, so they take its colours. */
/* Collapse buttons: the shared glass button, with label colours from the paper. */
.pane-head :deep(.ui-btn) {
  --c: var(--paper-muted);
}
.pane-head :deep(.ui-btn:hover) {
  --c: var(--paper-text);
}
.preview-head {
  padding: 0 0.35rem;
}
/* The focus dropdown is positioned against the preview pane. */
.preview-pane {
  position: relative;
}
.pane-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--paper-muted);
}
.pane-meta {
  flex: 1;
  min-width: 0;
  font-size: 0.72rem;
  color: var(--paper-muted);
}

.source {
  flex: 1;
  width: 100%;
  resize: none;
  padding: 1rem 1.1rem 40vh;
  border: 0;
  border-radius: 0;
  background: var(--paper-bg);
  color: var(--paper-text);
  caret-color: var(--accent-blue);
  font-family: var(--mono);
  font-size: 0.9rem;
  line-height: 1.6;
  tab-size: 2;
}
.source:focus {
  outline: none;
}
.source::placeholder {
  color: var(--paper-muted);
}
.pane ::selection {
  background: var(--paper-selection);
}

.preview-scroll:focus {
  outline: none; /* focusable only so arrow keys / Page Down scroll it */
}
.preview-scroll {
  flex: 1;
  overflow: auto;
  padding: 1.2rem 1.6rem 40vh;
}
/* Lines run the full width of the pane: widen the pane for longer lines. */
.preview-scroll .md-body {
  margin: 0;
}
.zoom {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.zoom select {
  height: 1.5rem;
  padding: 0 0.25rem;
  border: 1px solid var(--btn-border);
  border-radius: var(--btn-radius);
  background: var(--btn-bg);
  color: var(--btn-text);
  font: inherit;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.zoom select:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: 1px;
}
.empty-preview {
  color: var(--paper-muted);
  font-style: italic;
  text-align: center;
  margin-top: 3rem;
}

.divider {
  width: 0.5rem;
  cursor: col-resize;
  position: relative;
  touch-action: none;
}
.divider::after {
  content: '';
  position: absolute;
  inset: 25% 0.2rem;
  border-radius: 1px;
  background: transparent;
  transition: background 0.12s;
}
.divider:hover::after,
.panes.dragging .divider::after {
  background: var(--accent-blue);
}
.divider.inert {
  cursor: default;
}
.divider.inert::after {
  display: none;
}

.rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0;
  border: 1px solid var(--paper-border);
  border-radius: var(--radius);
  background: var(--paper-head);
  color: var(--paper-muted);
}
.rail:hover {
  color: var(--paper-text);
  border-color: var(--accent-blue);
}
.rail-icon {
  width: 1rem;
  height: 1rem;
  stroke-width: 1.75;
}
.rail-label {
  writing-mode: vertical-rl;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* Narrow screens: panes stay side by side, with tighter padding. */
@media (max-width: 760px) {
  .panes {
    padding: 0.35rem;
  }
  .source {
    padding: 0.75rem 0.7rem 2rem;
  }
  .preview-scroll {
    padding: 0.8rem 0.8rem 2rem;
  }
  /* Narrow panes: the dropdown alone sets the zoom. */
  .zoom :deep(.ui-btn) {
    display: none;
  }
}
</style>
