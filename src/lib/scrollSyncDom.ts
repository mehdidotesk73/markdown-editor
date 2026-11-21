// The measuring half of scroll sync (the mapping is in scrollSync.ts): where
// each source line and word sits in the editor, and where each rendered block
// and word sits in the preview. Heights are in px from the top of each pane's
// scrolled content.

import { cleanAnchors, isWord, type Anchor, type Box } from './scrollSync'

export interface EditorMetrics {
  text: string
  width: number
  /** Top of each source line. */
  tops: number[]
  /** Bottom of the last line. */
  height: number
}

const COPIED = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'tabSize', 'paddingTop', 'paddingLeft', 'paddingRight'] as const

/** An invisible copy of the textarea's text box, wrapping exactly as it does. */
function mirror(ta: HTMLTextAreaElement): HTMLDivElement {
  const cs = getComputedStyle(ta)
  const copy = document.createElement('div')
  for (const prop of COPIED) copy.style[prop] = cs[prop]
  copy.style.cssText += `;position:absolute;left:-99999px;top:0;visibility:hidden;box-sizing:border-box;width:${ta.clientWidth}px;white-space:pre-wrap;overflow-wrap:break-word`
  return copy
}

const cache = new WeakMap<HTMLTextAreaElement, EditorMetrics>()

/** Where each source line starts in the editor (wrapped lines are taller). Cached per text and width. */
export function editorMetrics(ta: HTMLTextAreaElement): EditorMetrics {
  const hit = cache.get(ta)
  if (hit && hit.text === ta.value && hit.width === ta.clientWidth) return hit
  const copy = mirror(ta)
  for (const line of ta.value.split('\n')) {
    const row = document.createElement('div')
    row.textContent = line || '​'
    copy.appendChild(row)
  }
  document.body.appendChild(copy)
  const rows = Array.from(copy.children) as HTMLElement[]
  const tops = rows.map((r) => r.offsetTop)
  const last = rows[rows.length - 1]
  const m = { text: ta.value, width: ta.clientWidth, tops, height: last ? last.offsetTop + last.offsetHeight : 0 }
  copy.remove()
  cache.set(ta, m)
  return m
}

/**
 * The words of source lines [from, to), as boxes in the editor, in reading
 * order. Fence lines (``` / ~~~) are skipped: they aren't words of the block.
 */
export function editorWordBoxes(ta: HTMLTextAreaElement, m: EditorMetrics, from: number, to: number): Box[] {
  const lines = ta.value.split('\n').slice(from, Math.max(from, to))
  if (!lines.length) return []
  const copy = mirror(ta)
  const spans: HTMLElement[] = []
  for (const line of lines) {
    const row = document.createElement('div')
    if (/^\s*(```|~~~)/.test(line)) row.textContent = line || '​'
    else {
      for (const part of line.split(/(\s+)/)) {
        if (isWord(part)) {
          const span = document.createElement('span')
          span.textContent = part
          row.appendChild(span)
          spans.push(span)
        } else row.appendChild(document.createTextNode(part))
      }
      if (!line) row.textContent = '​'
    }
    copy.appendChild(row)
  }
  document.body.appendChild(copy)
  // The copy holds only these lines: shift its heights to where they sit in the full text.
  const shift = (m.tops[from] ?? 0) - (copy.firstElementChild as HTMLElement).offsetTop
  const boxes = spans.map((s) => ({ top: s.offsetTop + shift, bottom: s.offsetTop + s.offsetHeight + shift }))
  copy.remove()
  return boxes
}

/** Each rendered block (its data-line, top and depth) in the preview. */
export function previewAnchors(pv: HTMLElement, lineCount: number): Anchor[] {
  const base = pv.getBoundingClientRect().top - pv.scrollTop
  const raw: Anchor[] = []
  for (const el of Array.from(pv.querySelectorAll<HTMLElement>('[data-line]'))) {
    let depth = 0
    for (let p = el.parentElement; p && p !== pv; p = p.parentElement) if (p.dataset.line !== undefined) depth++
    raw.push({ line: Number(el.dataset.line), top: el.getBoundingClientRect().top - base, depth, el })
  }
  const body = pv.querySelector<HTMLElement>('.md-body')
  const end = body ? body.getBoundingClientRect().bottom - base : pv.scrollHeight
  return cleanAnchors(raw, lineCount, end)
}

/**
 * A block's own words in the preview, as boxes in reading order — not the words
 * of blocks nested in it (they have their own data-line), and not KaTeX's
 * hidden MathML copy.
 */
export function previewWordBoxes(pv: HTMLElement, el: HTMLElement): Box[] {
  const base = pv.getBoundingClientRect().top - pv.scrollTop
  const boxes: Box[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p = node.parentElement; p && p !== el; p = p.parentElement) {
        if (p.dataset.line !== undefined || p.classList.contains('katex-mathml')) return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? ''
    for (const m of text.matchAll(/\S+/g)) {
      if (!isWord(m[0])) continue
      range.setStart(n, m.index!)
      range.setEnd(n, m.index! + m[0].length)
      const r = range.getClientRects()[0]
      if (r && r.height) boxes.push({ top: r.top - base, bottom: r.bottom - base })
    }
  }
  return boxes
}
