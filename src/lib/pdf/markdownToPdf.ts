import type { Token, Tokens } from 'marked'

// Markdown tokens (from the same `marked` instance the preview uses) → a
// pdfmake document. pdfmake lays out real text, so the PDF is selectable and
// searchable, and pages break between lines, never through them.
//
// Pure: everything async (math, images) is resolved beforehand and passed in.

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
  /** Decode HTML entities in token text ("&amp;" → "&"). */
  decode: (s: string) => string
  /** Code-block panel colours (from the current look via pdfCodeTint); default: C.blockBg / C.blockEdge. */
  codeTint?: CodeTint
  /** Mermaid diagrams by source, as SVG with their size in CSS px. Missing → shown as a code block. */
  diagrams?: Map<string, { svg: string; width: number; height: number }>
  /** Set by buildDocument: the body font, which diagram labels fall back to. */
  bodyFont?: PdfFont
}

/** Mermaid fenced blocks are drawn as diagrams. */
export function isMermaid(t: Token): t is Tokens.Code {
  return t.type === 'code' && ((t as Tokens.Code).lang ?? '').trim().toLowerCase() === 'mermaid'
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

function inline(tokens: Token[] | undefined, a: PdfAssets, marks: Record<string, unknown> = {}): Run[] {
  const out: Run[] = []
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text': {
        const tt = t as Tokens.Text
        if (tt.tokens?.length) out.push(...inline(tt.tokens, a, marks))
        else out.push({ text: a.decode(tt.text), ...marks })
        break
      }
      case 'escape':
        out.push({ text: a.decode((t as Tokens.Escape).text), ...marks })
        break
      case 'strong':
        out.push(...inline((t as Tokens.Strong).tokens, a, { ...marks, bold: true }))
        break
      case 'em':
        out.push(...inline((t as Tokens.Em).tokens, a, { ...marks, italics: true }))
        break
      case 'del':
        out.push(...inline((t as Tokens.Del).tokens, a, { ...marks, decoration: 'lineThrough' }))
        break
      case 'codespan':
        out.push({
          text: a.decode((t as Tokens.Codespan).text),
          ...marks,
          font: 'Mono',
          fontSize: BASE_SIZE * 0.88,
          background: C.codeBg,
        })
        break
      case 'link': {
        const l = t as Tokens.Link
        out.push(...inline(l.tokens, a, { ...marks, color: C.link, link: l.href }))
        break
      }
      case 'image': {
        const img = t as Tokens.Image
        out.push({ text: `[image: ${img.text || img.href}]`, ...marks, italics: true, color: C.muted })
        break
      }
      case 'br':
        out.push({ text: '\n', ...marks })
        break
      case 'html':
        out.push({ text: a.decode(stripTags((t as Tokens.HTML).text)), ...marks })
        break
      case 'inlineKatex':
        out.push({ text: a.inlineMath((t as unknown as { text: string }).text), ...marks, italics: true })
        break
      default:
        if ('text' in t && typeof t.text === 'string') out.push({ text: a.decode(t.text), ...marks })
    }
  }
  return out
}

function stripTags(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
}

/** A paragraph that is only an image renders as a block image. */
function soloImage(tokens: Token[] | undefined): Tokens.Image | null {
  const real = (tokens ?? []).filter((t) => !(t.type === 'text' && !(t as Tokens.Text).text.trim()))
  return real.length === 1 && real[0].type === 'image' ? (real[0] as Tokens.Image) : null
}

// ---- blocks ------------------------------------------------------------------

function rule(width: number, color = C.border, margin = [0, 2, 0, 8]): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.75, lineColor: color }],
    margin,
  }
}

function blocks(tokens: Token[], a: PdfAssets, width: number): Content[] {
  const out: Content[] = []
  for (const t of tokens) {
    const b = block(t, a, width)
    if (b) out.push(b)
  }
  return out
}

function block(t: Token, a: PdfAssets, width: number): Content | null {
  switch (t.type) {
    case 'space':
      return null

    case 'heading': {
      const h = t as Tokens.Heading
      const head = { text: inline(h.tokens, a), style: `h${h.depth}`, headlineLevel: h.depth }
      // h1/h2 carry a rule beneath, like the preview.
      return h.depth <= 2 ? [head, rule(width, C.border, [0, 0, 0, 8])] : head
    }

    case 'paragraph': {
      const p = t as Tokens.Paragraph
      const img = soloImage(p.tokens)
      if (img) return image(img, a, width)
      // `$$ … $$` written inside a line comes through as an inline token in
      // display mode: split the paragraph around it and typeset it as a block.
      if (p.tokens.some(isDisplayInline)) {
        const parts: Content[] = []
        let run: Token[] = []
        const flush = () => {
          if (run.some((x) => !(x.type === 'text' && !(x as Tokens.Text).text.trim())))
            parts.push({ text: inline(run, a), style: 'p' })
          run = []
        }
        for (const x of p.tokens) {
          if (isDisplayInline(x)) {
            flush()
            parts.push(displayMath((x as unknown as { text: string }).text, a, width))
          } else run.push(x)
        }
        flush()
        return parts
      }
      return { text: inline(p.tokens, a), style: 'p' }
    }

    case 'text': {
      // Block-level text inside tight list items.
      const tt = t as Tokens.Text
      return { text: tt.tokens ? inline(tt.tokens, a) : a.decode(tt.text) }
    }

    case 'code': {
      const d = isMermaid(t) ? a.diagrams?.get(t.text) : undefined
      if (d) {
        // CSS px → pt (×0.75), never wider than the column, nor taller than
        // ~70% of a page, so a tall chart still fits on the page after its heading.
        const maxH = 0.7 * (PAGE.height - PAGE.margins[1] - PAGE.margins[3])
        const w = Math.min(width, d.width * 0.75, (maxH * d.width) / d.height)
        return { svg: d.svg, width: w, font: a.bodyFont ?? 'Sans', alignment: 'center', margin: [0, 2, 0, 10] }
      }
      return codeBlock((t as Tokens.Code).text, width, a.codeTint)
    }

    case 'blockquote': {
      const q = t as Tokens.Blockquote
      return {
        table: { widths: ['*'], body: [[{ stack: blocks(q.tokens, a, width - 16), color: C.muted }]] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: (i: number) => (i === 0 ? 2.5 : 0),
          vLineColor: () => C.quote,
          paddingLeft: () => 10,
          paddingRight: () => 0,
          paddingTop: () => 2,
          paddingBottom: () => 0,
        },
        margin: [0, 0, 0, 8],
      }
    }

    case 'list':
      return list(t as Tokens.List, a, width)

    case 'table':
      return table(t as Tokens.Table, a)

    case 'hr':
      return rule(width, C.border, [0, 6, 0, 12])

    case 'html': {
      const text = a.decode(stripTags((t as Tokens.HTML).text)).trim()
      return text ? { text, style: 'p' } : null
    }

    case 'blockKatex':
      return displayMath((t as unknown as { text: string }).text, a, width)

    default:
      return 'text' in t && typeof t.text === 'string' && t.text.trim() ? { text: a.decode(t.text), style: 'p' } : null
  }
}

/** True for `$$ … $$` that marked-katex-extension tokenized inline. */
export function isDisplayInline(t: Token): boolean {
  return t.type === 'inlineKatex' && !!(t as unknown as { displayMode?: boolean }).displayMode
}

function displayMath(tex: string, a: PdfAssets, width: number): Content {
  const m = a.math.get(tex)
  if (!m) return { text: tex, font: 'Mono', fontSize: 9, alignment: 'center', margin: [0, 2, 0, 9] }
  const scale = Math.min(1, width / m.width)
  return { svg: m.svg, width: m.width * scale, height: m.height * scale, alignment: 'center', margin: [0, 4, 0, 10] }
}

function image(img: Tokens.Image, a: PdfAssets, width: number): Content {
  const data = a.images.get(img.href)
  if (!data) return { text: `[image: ${img.text || img.href}]`, italics: true, color: C.muted, style: 'p' }
  // Never upscale; fit the column width.
  const w = Math.min(width, data.width * 0.75)
  return { image: data.dataUrl, width: w, margin: [0, 2, 0, 9] }
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

function list(l: Tokens.List, a: PdfAssets, width: number, nested = false): Content {
  const inner = width - 18
  const items = l.items.map((item) => {
    // Tight items hold 'text' blocks; loose ones hold paragraphs. Drop the
    // checkbox token marked emits for task items; we draw our own marker.
    const toks = item.tokens.filter((x) => x.type !== 'checkbox')
    const stack = toks.map((x) => (x.type === 'list' ? list(x as Tokens.List, a, inner, true) : block(x, a, inner))).filter((c): c is Content => !!c).map((c) =>
      // Paragraph spacing inside list items is tighter.
      typeof c === 'object' && !Array.isArray(c) && c.style === 'p' ? { ...c, style: undefined, margin: [0, 0, 0, 2] } : c,
    )
    if (item.task) {
      return {
        columns: [
          { text: item.checked ? '☑' : '☐', width: 14, color: item.checked ? '#1a7f37' : C.muted },
          { stack, width: '*' },
        ],
        columnGap: 2,
        margin: [0, 0, 0, 2],
      }
    }
    return { stack, margin: [0, 0, 0, 2] }
  })
  const margin = nested ? [0, 2, 0, 0] : [0, 0, 0, 7]
  // A pure checklist: the boxes are the markers, so no bullet column.
  if (l.items.every((i) => i.task)) return { stack: items, margin }
  for (const [i, item] of l.items.entries()) if (item.task) (items[i] as Record<string, unknown>).listType = 'none'
  const node: Record<string, unknown> = { margin, markerColor: C.muted }
  if (l.ordered) {
    node.ol = items
    // Lettered lists (alphaList.ts): a) b) c) or A. B. C.
    const alpha = (l as Tokens.List & { alpha?: 'lower' | 'upper' }).alpha
    if (alpha) node.type = alpha === 'upper' ? 'upper-alpha' : 'lower-alpha'
    if (typeof l.start === 'number' && l.start !== 1) node.start = l.start
  } else {
    node.ul = items
  }
  return node
}

function table(tb: Tokens.Table, a: PdfAssets): Content {
  const cell = (c: Tokens.TableCell, i: number, header: boolean) => ({
    text: inline(c.tokens, a),
    bold: header,
    alignment: tb.align[i] ?? 'left',
    fillColor: header ? C.codeBg : undefined,
  })
  const cols = tb.header.length
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: cols > 4 ? Array(cols).fill('*') : Array(cols).fill('auto'),
      body: [tb.header.map((c, i) => cell(c, i, true)), ...tb.rows.map((r) => r.map((c, i) => cell(c, i, false)))],
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
  }
}

type NodeInfo = { headlineLevel?: number; canvas?: unknown }

/** The body font of the PDF (code always uses Mono). */
export type PdfFont = 'Sans' | 'Serif' | 'Mono'

/** Build the full pdfmake document definition. */
export function buildDocument(
  tokens: Token[],
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
    content: blocks(tokens, a, CONTENT_WIDTH),
    styles,
    defaultStyle: { font, fontSize: BASE_SIZE, lineHeight: 1.32, color: C.text },
    footer: (page: number, pages: number) =>
      pages > 1 ? { text: `${page} / ${pages}`, alignment: 'center', fontSize: 8, color: C.muted, margin: [0, 24, 0, 0] } : null,
    // Never leave a heading alone at the bottom of a page: if nothing but its
    // own rule follows it there, move it to the next page.
    pageBreakBefore: (
      node: NodeInfo,
      q: { getFollowingNodesOnPage: () => NodeInfo[]; getNodesOnNextPage: () => NodeInfo[] },
    ) =>
      !!node.headlineLevel &&
      q.getFollowingNodesOnPage().filter((n) => !n.canvas).length === 0 &&
      q.getNodesOnNextPage().length > 0,
  }
}
