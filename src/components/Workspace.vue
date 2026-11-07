<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { renderMarkdown } from '../lib/markdown'
import type { Tab } from '../lib/useTabs'
import UiButton from './ui/UiButton.vue'
import FocusControls from './FocusControls.vue'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plug } from '@lucide/vue'
import { useFocusShadow } from '../lib/focus/useFocusShadow'

// The split view for one tab: markdown source on the left, rendered preview
// on the right. Either side collapses to a thin rail — collapse the editor to
// read, collapse the preview to write. One side is always open.

const props = defineProps<{ tab: Tab }>()
defineEmits<{ (e: 'reconnect'): void }>()


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
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
  e.preventDefault()
  const ta = e.target as HTMLTextAreaElement
  if (!document.execCommand('insertText', false, '  ')) {
    ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end')
    props.tab.content = ta.value
  }
}

function onInput(e: Event) {
  props.tab.content = (e.target as HTMLTextAreaElement).value
}

// Keep the preview roughly level with the editor while scrolling the source.
function syncScroll() {
  const ta = textarea.value
  const pv = preview.value
  if (!ta || !pv || !both.value) return
  const max = ta.scrollHeight - ta.clientHeight
  const ratio = max > 0 ? ta.scrollTop / max : 0
  pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight)
}

// New tab → start both panes at the top.
watch(
  () => props.tab.id,
  () => {
    if (textarea.value) textarea.value.scrollTop = 0
    if (preview.value) preview.value.scrollTop = 0
  },
)

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
        </header>
        <FocusControls :supported="shadowSupported" :count="focusFrame?.count ?? 0" />
        <div ref="preview" class="preview-scroll">
          <!-- eslint-disable-next-line vue/no-v-html — sanitized by DOMPurify in lib/markdown.ts -->
          <article class="md-body" v-html="html" />
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
  padding: 0 0.8rem 0 0.35rem;
}
.pane-title {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--paper-muted);
}
.pane-meta {
  flex: 1;
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

.preview-scroll {
  flex: 1;
  overflow: auto;
  padding: 1.2rem 1.6rem 40vh;
}
.preview-scroll .md-body {
  max-width: 48rem;
  margin: 0 auto;
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
}
</style>
