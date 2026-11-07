import { shallowRef, watch, nextTick, onMounted, onBeforeUnmount, type Ref } from 'vue'
import { buildIndex, wordCoord, type FocusIndex } from './segment'
import { focusSpan, type FocusSpan } from './wave'
import { focalPoint } from './focal'
import { alignWords, mathRanges, previewRange } from './align'
import { focusSettings } from './settings'
import { logDebug } from '../../debug'

// The browser side of the focus engine: follows the cursor in the editor,
// keeps the document index current, places the focal point (distance units
// behind the cursor), and underlines the focus in the preview. Nothing per tab
// is kept: switching tabs rebuilds the index for that tab.
//
// Drawing uses the CSS Custom Highlight API (::highlight(focus-shadow) in
// styles/markdown.css): no DOM changes to the preview, so scroll position and
// selection are untouched. Browsers without it simply show no underline.

/** What the focus engine knows right now — the hook for later consumers (an AI pointer). */
export interface FocusFrame {
  cursorX: number
  /** Where the attention field is emitted from, on the word ruler. */
  focalX: number
  span: FocusSpan | null
  /** How many units of the current scale are in focus. */
  count: number
  /** The focus as source text. */
  text: string
}

interface PreviewWord {
  node: Text
  start: number
  end: number
  text: string
}

const HIGHLIGHT = 'focus-shadow' // the ::highlight() name in markdown.css
const wordSeg = new Intl.Segmenter(undefined, { granularity: 'word' })

// Minimal typing for the Custom Highlight API (not in every TS DOM lib yet).
type HighlightsRegistry = { set(name: string, h: unknown): void; delete(name: string): void }
const highlights = (globalThis.CSS as unknown as { highlights?: HighlightsRegistry } | undefined)?.highlights
const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight

/** Every word in the rendered preview, in order, with where it sits in the DOM. */
function previewWords(root: HTMLElement): PreviewWord[] {
  const out: PreviewWord[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    // Rendered math is skipped: its glyphs don't correspond to source words.
    acceptNode: (n) => ((n.parentElement?.closest('.katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
  })
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    for (const w of wordSeg.segment(n.data)) {
      if (w.isWordLike) out.push({ node: n, start: w.index, end: w.index + w.segment.length, text: w.segment })
    }
  }
  return out
}

export function useFocusShadow(opts: {
  tabId: Ref<string>
  text: Ref<string>
  html: Ref<string>
  textarea: Ref<HTMLTextAreaElement | undefined>
  preview: Ref<HTMLElement | undefined>
}) {
  const frame = shallowRef<FocusFrame | null>(null)
  let index: FocusIndex | null = null
  let words: PreviewWord[] = []
  let map: Int32Array = new Int32Array(0)
  let caret = 0

  // ---- index + alignment ---------------------------------------------------

  function realign() {
    const root = opts.preview.value
    if (!index || !root) {
      words = []
      map = new Int32Array(0)
      return
    }
    words = previewWords(root)
    // Words inside formulas are left blank: the preview shows rendered math, not them.
    const math = mathRanges(index.text)
    let m = 0
    const src: string[] = new Array(index.words.length)
    for (let i = 0; i < index.words.length; i++) {
      const at = index.words.start[i]
      while (m < math.length && math[m][1] <= at) m++
      src[i] = m < math.length && math[m][0] <= at ? '' : index.text.slice(at, index.words.end[i])
    }
    map = alignWords(
      src,
      words.map((w) => w.text),
    )
  }

  function rebuild() {
    try {
      index = buildIndex(opts.text.value)
    } catch (e) {
      logDebug(`Focus index failed: ${(e as Error).message}`, 'warn')
      index = null
    }
  }

  // ---- compute + draw --------------------------------------------------------

  function clear() {
    highlights?.delete(HIGHLIGHT)
  }

  function draw(span: FocusSpan | null) {
    if (!highlights || !HighlightCtor || !span) return clear()
    const pr = previewRange(map, span.w0, span.w1)
    const a = pr && words[pr.from]
    const b = pr && words[pr.to]
    if (!a || !b || !a.node.isConnected || !b.node.isConnected) return clear()
    const range = document.createRange()
    range.setStart(a.node, a.start)
    range.setEnd(b.node, b.end)
    highlights.set(HIGHLIGHT, new HighlightCtor(range))
  }

  let raf = 0
  function schedule() {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      compute()
    })
  }

  function compute() {
    const s = focusSettings
    if (!s.enabled || !index) {
      clear()
      frame.value = null
      return
    }
    const cursorX = wordCoord(index, caret)
    const focalX = focalPoint(index, s.scale, cursorX, s.distance)
    const span = focusSpan(index, s.scale, focalX, s.decay[s.scale])
    frame.value = {
      cursorX,
      focalX,
      span,
      count: span ? span.last - span.first + 1 : 0,
      text: span ? index.text.slice(span.start, span.end) : '',
    }
    draw(span)
  }

  // ---- cursor ---------------------------------------------------------------

  function readCaret() {
    const ta = opts.textarea.value
    if (!ta) return
    caret = ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd
    schedule()
  }
  const caretEvents = ['keyup', 'click', 'select', 'focus', 'input'] as const
  function onSelectionChange() {
    if (document.activeElement === opts.textarea.value) readCaret()
  }
  function attach(ta: HTMLTextAreaElement | undefined, old?: HTMLTextAreaElement) {
    for (const ev of caretEvents) old?.removeEventListener(ev, readCaret)
    for (const ev of caretEvents) ta?.addEventListener(ev, readCaret)
  }

  // ---- lifecycle ------------------------------------------------------------

  /** New tab (or first show): fresh index, read the cursor. */
  async function startTab() {
    rebuild()
    await nextTick()
    realign()
    const ta = opts.textarea.value
    caret = ta ? ta.selectionEnd : 0
    schedule()
  }

  // Typing: the index is rebuilt after a short pause (large documents take a
  // few hundred ms to segment); cursor moves in between use the last index.
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(opts.text, () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      rebuild()
      await nextTick()
      realign()
      schedule()
    }, 150)
  })
  // The preview re-renders on every edit: re-find its words, then redraw.
  watch(opts.html, async () => {
    await nextTick()
    realign()
    schedule()
  })
  watch(opts.tabId, startTab)
  watch(opts.textarea, (ta, old) => attach(ta, old))
  watch(opts.preview, async () => {
    await nextTick()
    realign()
    schedule()
  })
  watch(focusSettings, () => schedule(), { deep: true })

  onMounted(() => {
    attach(opts.textarea.value)
    document.addEventListener('selectionchange', onSelectionChange)
    startTab()
  })
  onBeforeUnmount(() => {
    attach(undefined, opts.textarea.value)
    document.removeEventListener('selectionchange', onSelectionChange)
    clearTimeout(timer)
    cancelAnimationFrame(raf)
    clear()
  })

  return { frame, supported: !!highlights && !!HighlightCtor }
}
