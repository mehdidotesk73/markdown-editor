import { plainText, type Block, type Inline } from '../md/ast'

// The document tree (lib/md — the same tree the preview renders) → a pdfmake
// document. pdfmake lays out real text, so the PDF is selectable and
// searchable, and pages break between lines, never through them.
//
// Pure: everything async (math, images, diagrams) is resolved beforehand and passed in.
//
// Every node also carries an `ml` tag (pdfmake ignores unknown keys) naming what
// it is — 'heading', 'p', 'code', 'list', 'item' … — so the conformance tests can
// read the plan back as structure (tests/conformance/pdfOutline.ts).

/** pdfmake's content tree, loosely typed (the library ships no types for 0.3). */
export type Content = string | { [key: string]: unknown } | Content[]

export interface RenderedMath {
  svg: string
  width: number // pt
  height: number // pt
}

export interface PdfAssets {
  /** Display math by TeX source. Missing → falls back to the TeX text. */
  math: Map<string, RenderedMath>
  /** Images by URL, as data URLs. Missing → the alt text is shown instead. */
  images: Map<string, { dataUrl: string; width: number; height: number }>
  /** Inline math → Unicode text (e.g. "x^2" → "x²"). */
  inlineMath: (tex: string) => string
  /** Code-block panel colours (from the current look via pdfCodeTint); default: C.blockBg / C.blockEdge. */
  codeTint?: CodeTint
  /** Mermaid diagrams by source, as SVG with their size in CSS px. Missing → shown as a code block. */
  diagrams?: Map<string, { svg: string; width: number; height: number }>
  /** Set by buildDocument: the body font, which diagram labels fall back to. */
  bodyFont?: PdfFont
}

/** A1: a ```mermaid block (exactly) is drawn as a diagram. */
export function isMermaid(b: Block): boolean {
  return b.type === 'code' && b.fenced && b.info.split(/\s+/)[0] === 'mermaid'
}

/** The source of a code or math block, without its final newline. */
export function blockText(b: Block): string {
  return b.content.replace(/\n$/, '')
}

// ---- page + typography -------------------------------------------------------

export const PAGE = { width: 595.28, height: 841.89, margins: [54, 56, 54, 60] as const }
export const CONTENT_WIDTH = PAGE.width - PAGE.margins[0] - PAGE.margins[2]

const C = {
  text: '#1f2328',
  muted: '#59636e',
  border: '#d5d9e0',
  codeBg: '#f3f5f8',
  // Code blocks, when no look colour is given (tests): a soft cream. Exports
  // derive the tint from the current look instead — see pdfCodeTint.
  blockBg: '#f9f6f0',
  blockEdge: '#e3dccf',
  link: '#1f5fd1',
  quote: '#4f8ef7',
}

/** A5: alert colours on the white page (GitHub's light palette, slightly muted). */
const ALERT: Record<string, { title: string; color: string }> = {
  note: { title: 'Note', color: '#3b679f' },
  tip: { title: 'Tip', color: '#3f8a5c' },
  important: { title: 'Important', color: '#7556a3' },
  warning: { title: 'Warning', color: '#9c6a1d' },
  caution: { title: 'Caution', color: '#b5483b' },
}

export const BASE_SIZE = 10.5

export const styles = {
  h1: { fontSize: 20, bold: true, margin: [0, 6, 0, 4] },
  h2: { fontSize: 16, bold: true, margin: [0, 12, 0, 4] },
  h3: { fontSize: 13, bold: true, margin: [0, 10, 0, 4] },
  h4: { fontSize: 11.5, bold: true, margin: [0, 8, 0, 3] },
  h5: { fontSize: 10.5, bold: true, margin: [0, 8, 0, 3] },
  h6: { fontSize: 10.5, bold: true, color: C.muted, margin: [0, 8, 0, 3] },
  p: { margin: [0, 0, 0, 7] },
  code: { font: 'Mono', fontSize: 8.8, lineHeight: 1.25, preserveLeadingSpaces: true },
}

// ---- inline ------------------------------------------------------------------

type Run = { [key: string]: unknown; text: string | Run[] }

function inline(nodes: Inline[], a: PdfAssets, marks: Record<string, unknown> = {}): Run[] {
  const out: Run[] = []
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        out.push({ text: n.value, ...marks })
        break
      case 'softbreak':
        out.push({ text: ' ', ...marks })
        break
      case 'hardbreak':
        out.push({ text: '\n', ...marks })
        break
      case 'strong':
        out.push(...inline(n.children, a, { ...marks, bold: true }))
        break
      case 'emph':
        out.push(...inline(n.children, a, { ...marks, italics: true }))
        break
      case 'del':
        out.push(...inline(n.children, a, { ...marks, decoration: 'lineThrough' }))
        break
      case 'code':
        out.push({ text: n.value, ...marks, font: 'Mono', fontSize: BASE_SIZE * 0.88, background: C.codeBg })
        break
      case 'math':
        out.push({ text: a.inlineMath(n.value), ...marks, italics: true, ml: 'math', mlText: n.value })
        break
      case 'link':
        out.push(...inline(n.children, a, { ...marks, color: C.link, link: n.href }))
        break
      case 'image':
        out.push({ text: `[image: ${plainText(n.children) || n.src}]`, ...marks, italics: true, color: C.muted, ml: 'img', mlSrc: n.src, mlText: plainText(n.children) })
        break
      case 'html':
        out.push({ text: stripTags(n.value), ...marks })
        break
    }
  }
  return out
}

function stripTags(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
}

/** A paragraph that is only an image renders as a block image. */
function soloImage(nodes: Inline[]): Extract<Inline, { type: 'image' }> | null {
  const real = nodes.filter((n) => !(n.type === 'text' && !n.value.trim()) && n.type !== 'softbreak')
  return real.length === 1 && real[0].type === 'image' ? real[0] : null
}

// ---- blocks ------------------------------------------------------------------

function rule(width: number, color = C.border, margin = [0, 2, 0, 8]): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.75, lineColor: color }],
    margin,
  }
}

function blocks(list: Block[], a: PdfAssets, width: number): Content[] {
  const out: Content[] = []
  for (const b of list) {
    const c = block(b, a, width)
    if (c) out.push(c)
  }
  return out
}

/** A quote-like panel: a coloured bar on the left. */
function sidebar(stack: Content[], width: number, color: string, textColor?: string): Content {
  void width
  return {
    table: { widths: ['*'], body: [[{ stack, ...(textColor ? { color: textColor } : {}) }]] },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
      vLineColor: () => color,
      paddingLeft: () => 10,
      paddingRight: () => 0,
      paddingTop: () => 2,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 8],
  }
}

function block(b: Block, a: PdfAssets, width: number): Content | null {
  switch (b.type) {
    case 'heading': {
      const head = { text: inline(b.inlines, a), style: `h${b.level}`, headlineLevel: b.level, ml: 'heading' }
      // h1/h2 carry a rule beneath, like the preview.
      return b.level <= 2 ? [head, { ...(rule(width, C.border, [0, 0, 0, 8]) as object), ml: 'rule' }] : head
    }

    case 'paragraph': {
      const img = soloImage(b.inlines)
      if (img) return image(img, a, width)
      return { text: inline(b.inlines, a), style: 'p', ml: 'p' }
    }

    case 'code': {
      const d = isMermaid(b) ? a.diagrams?.get(blockText(b)) : undefined
      if (d) {
        // CSS px → pt (×0.75), never wider than the column, nor taller than a
        // page less room for a heading above it: a tall chart takes the rest of
        // the page, and with its heading moves to the next page if need be.
        const maxH = PAGE.height - PAGE.margins[1] - PAGE.margins[3] - DIAGRAM_HEADROOM
        const w = Math.min(width, d.width * 0.75, (maxH * d.width) / d.height)
        return { svg: d.svg, width: w, font: a.bodyFont ?? 'Sans', alignment: 'center', margin: [0, 2, 0, 10], ml: 'diagram', mlText: blockText(b) }
      }
      const lang = b.fenced ? b.info.split(/\s+/)[0] : ''
      return { ...(codeBlock(blockText(b), width, a.codeTint) as object), ml: isMermaid(b) ? 'diagram' : 'code', mlLang: lang, mlText: blockText(b) }
    }

    case 'math':
      return displayMath(blockText(b).trim(), a, width)

    case 'blockquote':
      return { ...(sidebar(blocks(b.children, a, width - 16), width, C.quote, C.muted) as object), ml: 'quote' }

    case 'alert': {
      const al = ALERT[b.alert] ?? ALERT.note
      const title = { text: al.title, bold: true, color: al.color, margin: [0, 0, 0, 3], ml: 'alert-title' }
      return { ...(sidebar([title, ...blocks(b.children, a, width - 16)], width, al.color) as object), ml: 'alert', mlAlert: b.alert }
    }

    case 'list':
      return list(b, a, width)

    case 'table':
      return table(b, a)

    case 'hr':
      return { ...(rule(width, C.border, [0, 6, 0, 12]) as object), ml: 'hr' }

    case 'html': {
      const text = stripTags(b.content).trim()
      return text ? { text, style: 'p', ml: 'html' } : null
    }

    default:
      return null
  }
}

function displayMath(tex: string, a: PdfAssets, width: number): Content {
  const m = a.math.get(tex)
  if (!m) return { text: tex, font: 'Mono', fontSize: 9, alignment: 'center', margin: [0, 2, 0, 9], ml: 'math', mlText: tex }
  const scale = Math.min(1, width / m.width)
  return { svg: m.svg, width: m.width * scale, height: m.height * scale, alignment: 'center', margin: [0, 4, 0, 10], ml: 'math', mlText: tex }
}

function image(img: Extract<Inline, { type: 'image' }>, a: PdfAssets, width: number): Content {
  const data = a.images.get(img.src)
  const tag = { ml: 'image', mlSrc: img.src, mlText: plainText(img.children) }
  if (!data) return { text: `[image: ${plainText(img.children) || img.src}]`, italics: true, color: C.muted, style: 'p', ...tag }
  // Never upscale; fit the column width.
  const w = Math.min(width, data.width * 0.75)
  return { image: data.dataUrl, width: w, margin: [0, 2, 0, 9], ...tag }
}

// ---- code blocks ------------------------------------------------------------
//
// A one-cell table with a grey tint and a soft hairline edge. A table sizes
// itself to the code, pdfmake wraps long lines (breaking long tokens too), and
// a block taller than the space left continues onto the next page, tint and
// all. Square corners: pdfmake tables can't round them, and the user preferred
// a tint that always applies cleanly over rounded corners that need the
// block's height worked out in advance.

const CODE_PAD_X = 10
const CODE_PAD_Y = 8
// DejaVu Sans Mono: every character advances 1233/2048 em; code is 8.8pt.
const MONO_ADVANCE = (1233 / 2048) * 8.8

/**
 * pdfmake only wraps at spaces, so a token longer than a whole line (a hash, a
 * URL) would run off the page. Split just those into line-sized pieces; the
 * font is monospaced, so `cols` characters always fit.
 */
export function breakLongTokens(text: string, cols: number): string {
  if (cols < 1) return text
  return text.replace(new RegExp(`\\S{${cols + 1},}`, 'g'), (tok) => tok.match(new RegExp(`.{1,${cols}}`, 'g'))!.join('\n'))
}

export interface CodeTint {
  bg: string
  edge: string
}

/** Parse "#rgb", "#rrggbb" or "rgb(r, g, b)" into 0–255 channels; null if unreadable. */
function parseColor(css: string): [number, number, number] | null {
  const s = css.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number]
  m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number]
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return null
}

function hslHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

/**
 * The PDF code-block tint for a look, from the preview's code-block colour
 * (`--paper-code-bg`): its hue, saturation ×1.3 (capped at 90%), lightness 91%
 * for the fill and 65% for the edge (edge saturation capped at 80%). Grey looks
 * carry little colour, so they go a little darker ("grey depth": up to 1.5% at
 * zero saturation, none from 30% up) to still read on a bright monitor.
 * Settings chosen by the user in the Code Tint Tuner
 * (claude.ai/artifact/6tQDbYREFcXJXwHm7JyPUw).
 */
export const CODE_TINT = { lightness: 0.91, boost: 1.3, floor: 0, cap: 0.9, greyDepth: 0.015, edgeLightness: 0.65, edgeCap: 0.8 }
export function pdfCodeTint(css: string | null | undefined): CodeTint {
  const rgb = css ? parseColor(css) : null
  if (!rgb) return { bg: C.blockBg, edge: C.blockEdge }
  const [r, g, b] = rgb.map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  if (d) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  const k = CODE_TINT
  const sat = Math.min(k.cap, Math.max(k.floor, s * k.boost))
  const deepen = k.greyDepth * Math.max(0, 1 - s / 0.3)
  return {
    bg: hslHex(h, sat, k.lightness - deepen),
    edge: hslHex(h, Math.min(k.edgeCap, sat), k.edgeLightness - deepen),
  }
}

function codeBlock(source: string, width: number, tint: CodeTint = { bg: C.blockBg, edge: C.blockEdge }): Content {
  const cols = Math.max(8, Math.floor((width - 2 * CODE_PAD_X - 2) / MONO_ADVANCE))
  const text = breakLongTokens(source.replace(/\t/g, '    '), cols) || ' '
  return {
    table: { widths: ['*'], body: [[{ text, style: 'code' }]] },
    layout: {
      fillColor: () => tint.bg,
      hLineColor: () => tint.edge,
      vLineColor: () => tint.edge,
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      paddingLeft: () => CODE_PAD_X,
      paddingRight: () => CODE_PAD_X,
      paddingTop: () => CODE_PAD_Y,
      paddingBottom: () => CODE_PAD_Y,
    },
    margin: [0, 0, 0, 9],
  }
}

/** pdfmake's bullet gutter at the body size: where a bullet item's text starts. */
const BULLET_GUTTER = 13.36

function list(l: Block, a: PdfAssets, width: number, nested = false): Content {
  const ld = l.list!
  // A bullet list mixing todos / labels with plain items keeps its bullet gutter.
  const marks = l.children.map((i) => i.checked !== null || i.label !== null)
  const mixed = !ld.ordered && marks.some(Boolean) && !marks.every(Boolean)
  const inner = width - 18
  const items = l.children.map((item) => {
    // Tight lists: paragraphs sit close, like lines. Loose lists keep paragraph spacing.
    const pGap = l.tight ? 2 : 5
    const stack = item.children
      .map((x) => (x.type === 'list' ? list(x, a, inner, true) : block(x, a, inner)))
      .filter((c): c is Content => !!c)
      .map((c) => (typeof c === 'object' && !Array.isArray(c) && c.style === 'p' ? { ...c, style: undefined, margin: [0, 0, 0, pGap] } : c))
    const tags = { ml: 'item', mlChecked: item.checked, mlLabel: item.label }
    // An item ending in a nested list takes no gap of its own: that list's
    // last item already left one, so every row is spaced alike.
    const last = item.children[item.children.length - 1]
    const gap = last?.type === 'list' ? 0 : l.tight ? 2 : 4
    // A todo's box, or an A3 label, is drawn as its own column beside the first line.
    const lead =
      item.checked !== null
        ? { text: item.checked ? '☑' : '☐', width: 14, color: item.checked ? '#1a7f37' : C.muted, ml: 'lead' }
        : item.label !== null
          ? { text: item.label, width: 'auto', margin: [0, 0, 4, 0], ml: 'lead' }
          : null
    if (lead) {
      // A numbered todo keeps its number (A4); the box goes beside the first line
      // only, so anything nested starts at the item's own indent.
      if (ld.ordered) {
        const [head, ...rest] = stack
        return { stack: [{ columns: [lead, { stack: head ? [head] : [], width: '*' }], columnGap: 2 }, ...rest], margin: [0, 0, 0, gap], ...tags }
      }
      // In a list that also has plain items, the box or label sits in the bullet's
      // gutter (pulled left by its width), so every item's text lines up.
      if (mixed) return { columns: [{ ...lead, width: BULLET_GUTTER - 2 }, { stack, width: '*' }], columnGap: 2, margin: [-BULLET_GUTTER, 0, 0, gap], ...tags }
      return { columns: [lead, { stack, width: '*' }], columnGap: 2, margin: [0, 0, 0, gap], ...tags }
    }
    return { stack, margin: [0, 0, 0, gap], ...tags }
  })
  const margin = nested ? [0, 2, 0, 0] : [0, 0, 0, 7]
  const listTags = { ml: 'list', mlOrdered: ld.ordered, mlStart: ld.start, mlTight: l.tight }
  // Bullet todos and labels replace the bullet. (A list of only those needs no bullet column.)
  if (!ld.ordered) {
    const replaced = l.children.map((i) => i.checked !== null || i.label !== null)
    if (replaced.every(Boolean)) return { stack: items, margin, ...listTags }
    replaced.forEach((m, i) => {
      if (m) (items[i] as Record<string, unknown>).listType = 'none'
    })
  }
  const node: Record<string, unknown> = { margin, markerColor: C.muted, ...listTags }
  if (ld.ordered) {
    node.ol = items
    // "1)" lists show their ")" as typed.
    if (ld.marker === ')') node.separator = ')'
    if (ld.start !== 1) node.start = ld.start
  } else {
    node.ul = items
  }
  return node
}

/**
 * A table column is never narrower than its longest unbreakable word, so a long
 * identifier or URL in a cell would push the table off the page. Give such
 * words break points every few characters: a zero-width space, which the body
 * fonts have — and which, for code (Mono has none), goes in a tiny run of its own.
 */
const LONG_WORD = 24
function breakable(runs: Run[], bodyFont: string): Run[] {
  const out: Run[] = []
  for (const r of runs) {
    if (typeof r.text !== 'string' || !new RegExp(`\\S{${LONG_WORD + 1}}`).test(r.text)) {
      out.push(r)
      continue
    }
    const pieces = r.text.split(/(\S{12})/).filter((x) => x !== '')
    if (r.font === 'Mono') {
      pieces.forEach((piece, i) => {
        if (i) out.push({ ...r, text: '\u200B', font: bodyFont, background: undefined, ml: 'break' })
        out.push({ ...r, text: piece, ...(i ? { mlJoin: true } : {}) })
      })
    } else out.push({ ...r, text: pieces.join('\u200B') })
  }
  return out
}

function table(tb: Block, a: PdfAssets): Content {
  const cell = (c: Inline[], i: number, header: boolean) => ({
    text: breakable(inline(c, a), a.bodyFont ?? 'Sans'),
    bold: header,
    alignment: tb.align[i] ?? 'left',
    fillColor: header ? C.codeBg : undefined,
  })
  const [head, ...body] = tb.rows
  const cols = head.length
  // Columns fit their content, unless the table would be wider than the page:
  // then the wide columns share the room left and wrap ('*').
  const est = head.map((_, i) => Math.max(...tb.rows.map((r) => plainText(r[i] ?? []).length)) * 5.6 + 13)
  const tooWide = est.reduce((x, y) => x + y, 0) > CONTENT_WIDTH
  const widths = cols > 4 ? Array(cols).fill('*') : est.map((w) => (tooWide && w > CONTENT_WIDTH / cols ? '*' : 'auto'))
  return {
    table: {
      headerRows: 1,
      // The header never sits alone at the bottom of a page: it moves with the first row.
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths,
      body: [head.map((c, i) => cell(c, i, true)), ...body.map((r) => r.map((c, i) => cell(c, i, false)))],
    },
    layout: {
      hLineColor: () => C.border,
      vLineColor: () => C.border,
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 0, 0, 9],
    ml: 'table',
    mlAlign: tb.align,
  }
}

type NodeInfo = { headlineLevel?: number; canvas?: unknown; id?: string }
const FOOTER_ID = 'page-footer'
/** Room left above a page-tall diagram for its heading (an h1 and its rule) and margins. */
const DIAGRAM_HEADROOM = 64

/** The body font of the PDF (code always uses Mono). */
export type PdfFont = 'Sans' | 'Serif' | 'Mono'

/** Build the full pdfmake document definition. */
export function buildDocument(
  doc: Block,
  title: string,
  a: PdfAssets,
  font: PdfFont = 'Sans',
  codeTint?: CodeTint,
): Record<string, unknown> {
  a.codeTint = codeTint
  a.bodyFont = font
  return {
    info: { title },
    pageSize: 'A4',
    pageMargins: [...PAGE.margins],
    content: blocks(doc.children, a, CONTENT_WIDTH),
    styles,
    defaultStyle: { font, fontSize: BASE_SIZE, lineHeight: 1.32, color: C.text },
    footer: (page: number, pages: number) =>
      pages > 1 ? { id: FOOTER_ID, text: `${page} / ${pages}`, alignment: 'center', fontSize: 8, color: C.muted, margin: [0, 24, 0, 0] } : null,
    // Never leave a heading alone at the bottom of a page: if nothing but its
    // own rule follows it there, move it to the next page. (pdfmake lists the
    // page-number footer among a page's nodes, so it is ignored by its id —
    // without that, this never fired on a multi-page PDF.)
    pageBreakBefore: (
      node: NodeInfo,
      q: { getFollowingNodesOnPage: () => NodeInfo[]; getNodesOnNextPage: () => NodeInfo[] },
    ) =>
      !!node.headlineLevel &&
      q.getFollowingNodesOnPage().filter((n) => !n.canvas && n.id !== FOOTER_ID).length === 0 &&
      q.getNodesOnNextPage().length > 0,
  }
}
