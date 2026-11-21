// Rendered HTML → a structural outline: one line per block, indented by depth,
// with each paragraph's inline content written in a canonical inline form.
// Two renderers agree on structure exactly when their outlines are equal, so
// cosmetic differences (attribute order, whitespace, KaTeX's internal markup,
// wrapper divs) don't count, while every structural one (nesting, tight/loose,
// list start, code text, table cells, link targets) does.
//
//   ol start=3
//     li [x]
//       text: Use **bold** and `code` — see [docs](./a.md)
//       ul
//         li
//           text: child
//   code lang=python
//     | print("hi")
//   math-block: a^2 + b^2
//   diagram mermaid
//     | flowchart LR
//
// "Flat" mode writes inline content as runs of text with their marks, the way a
// PDF holds it (no nesting): "plain «b|bold» «b,i|both» «c|code» «a=url|link»".
// The PDF's layout plan is read back in the same form (pdfOutline.ts), so the two
// can be compared.

import { parse, type HTMLElement, type Node } from 'node-html-parser'

const ELEMENT = 1
const TEXT = 3
const BLOCK = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'hr', 'div', 'section',
])

const isEl = (n: Node): n is HTMLElement => n.nodeType === ELEMENT
const tag = (n: HTMLElement) => n.rawTagName?.toLowerCase() ?? ''
const cls = (n: HTMLElement) => (n.getAttribute('class') ?? '').split(/\s+/)

/** The TeX source of a KaTeX render (its MathML annotation). */
function texOf(n: HTMLElement): string {
  const a = n.querySelector('annotation')
  return (a?.text ?? n.text).trim()
}

const isDisplayMath = (n: HTMLElement) =>
  cls(n).includes('katex-display') || cls(n).includes('math-display') || !!n.querySelector('.katex-display')

const isInlineMath = (n: HTMLElement) => cls(n).includes('katex') || cls(n).includes('math-inline')

// ---- flat inline runs ----------------------------------------------------------

export interface Seg {
  marks: string[]
  text: string
  /** Code, math and image text is kept as is (no whitespace collapsing). */
  raw: boolean
}

/** Inline content as flat runs with their marks (HTML side). */
function flatSegs(nodes: Node[], marks: string[] = []): Seg[] {
  const out: Seg[] = []
  const links = marks.filter((m) => m.startsWith('a='))
  for (const n of nodes) {
    if (n.nodeType === TEXT) {
      out.push({ marks, text: (n as unknown as { text: string }).text, raw: false })
      continue
    }
    if (!isEl(n)) continue
    const t = tag(n)
    if (t === 'span' && isInlineMath(n)) out.push({ marks: [...links, 'm'], text: texOf(n), raw: true })
    else if (t === 'strong' || t === 'b') out.push(...flatSegs(n.childNodes, [...marks, 'b']))
    else if (t === 'em' || t === 'i') out.push(...flatSegs(n.childNodes, [...marks, 'i']))
    else if (t === 'del' || t === 's') out.push(...flatSegs(n.childNodes, [...marks, 's']))
    else if (t === 'code') out.push({ marks: [...marks, 'c'], text: n.text, raw: true })
    else if (t === 'br') out.push({ marks: [], text: '⏎', raw: true })
    else if (t === 'a') out.push(...flatSegs(n.childNodes, [...marks, `a=${n.getAttribute('href') ?? ''}`]))
    else if (t === 'img') out.push({ marks: [...links, `img=${n.getAttribute('src') ?? ''}`], text: n.getAttribute('alt') ?? '', raw: true })
    else if (t === 'input') {
      /* checkboxes are read by the list item */
    } else out.push(...flatSegs(n.childNodes, marks))
  }
  return out
}

/** Runs → one canonical string: merge equal neighbours, collapse spaces, trim the ends. */
export function serializeSegs(segs: Seg[]): string {
  const key = (s: Seg) => [...new Set(s.marks)].sort().join(',')
  const merged: Seg[] = []
  for (const s of segs) {
    const last = merged[merged.length - 1]
    if (last && !last.raw && !s.raw && key(last) === key(s)) last.text += s.text
    else merged.push({ marks: [...new Set(s.marks)].sort(), text: s.text, raw: s.raw })
  }
  for (const s of merged) if (!s.raw) s.text = s.text.replace(/[ \t\r\n]+/g, ' ')
  // Spaces beside a line break are invisible.
  merged.forEach((s, i) => {
    if (s.raw) return
    if (merged[i - 1]?.text === '⏎') s.text = s.text.replace(/^ +/, '')
    if (merged[i + 1]?.text === '⏎') s.text = s.text.replace(/ +$/, '')
  })
  if (merged.length) merged[0].text = merged[0].text.replace(/^ +/, '')
  if (merged.length) merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/ +$/, '')
  return merged
    .filter((s) => s.text !== '' || s.marks.some((m) => m.startsWith('img=')))
    .map((s) => (s.marks.length ? `«${s.marks.join(',')}|${s.text}»` : s.text))
    .join('')
    .replace(/ ?⏎ ?/g, '⏎')
}

let flat = false

/** An element's inline content in the current mode. */
function inlineText(nodes: Node[]): string {
  return flat ? serializeSegs(flatSegs(nodes)) : tidy(inline(nodes))
}

/** Canonical inline form of an element's children. */
export function inline(nodes: Node[]): string {
  let out = ''
  for (const n of nodes) {
    if (n.nodeType === TEXT) {
      out += (n as unknown as { text: string }).text // .text is entity-decoded
      continue
    }
    if (!isEl(n)) continue
    const t = tag(n)
    if (t === 'span' && isInlineMath(n)) out += `$${texOf(n)}$`
    else if (t === 'strong' || t === 'b') out += `**${inline(n.childNodes)}**`
    else if (t === 'em' || t === 'i') out += `*${inline(n.childNodes)}*`
    else if (t === 'del' || t === 's') out += `~~${inline(n.childNodes)}~~`
    else if (t === 'code') out += '`' + n.text + '`'
    else if (t === 'br') out += '⏎'
    else if (t === 'a') {
      const title = n.getAttribute('title')
      out += `[${inline(n.childNodes)}](${n.getAttribute('href') ?? ''}${title ? ` "${title}"` : ''})`
    } else if (t === 'img') {
      const title = n.getAttribute('title')
      out += `![${n.getAttribute('alt') ?? ''}](${n.getAttribute('src') ?? ''}${title ? ` "${title}"` : ''})`
    } else if (t === 'input') {
      /* checkboxes are read by the list item */
    } else out += inline(n.childNodes)
  }
  return out
}

/** Collapse whitespace the way a browser lays text out (code keeps its own). */
function tidy(s: string): string {
  return s.replace(/[ \t\r\n]+/g, ' ').replace(/ ?⏎ ?/g, '⏎').trim()
}

export function codeLines(text: string, pad: string): string[] {
  // Trailing blank lines are invisible; renderers differ on them for unclosed fences.
  const body = text.replace(/\n[ \t\n]*$/, '')
  if (!body) return [`${pad}  (empty)`]
  return body.split('\n').map((l) => `${pad}  | ${l}`)
}

function blockLines(n: HTMLElement, depth: number, out: string[]) {
  const pad = '  '.repeat(depth)
  const t = tag(n)

  // Display math, wherever a renderer wraps it (a <p>, a <div class="math-display"> …).
  // A formula KaTeX couldn't typeset is still display math (its source, shown as an error).
  if (t === 'div' && cls(n).includes('math-display') && !n.querySelector('.katex')) {
    out.push(`${pad}math-block: ${tidy(n.text)}`)
    return
  }
  if ((t === 'p' || t === 'div' || t === 'span') && isDisplayMath(n) && !tidy(inline(n.childNodes).replace(/\$[^$]*\$/g, ''))) {
    out.push(`${pad}math-block: ${tidy(texOf(n))}`)
    return
  }
  // GitHub-style alerts: <div class="markdown-alert markdown-alert-note"> with a title paragraph.
  const alert = t === 'div' ? cls(n).find((c) => c.startsWith('markdown-alert-')) : undefined
  if (alert) {
    out.push(`${pad}alert ${alert.slice('markdown-alert-'.length)}`)
    const body = n.childNodes.filter((c) => !(isEl(c) && cls(c).includes('markdown-alert-title')))
    const wrap = parse('<div></div>').firstChild as HTMLElement
    for (const c of body) wrap.appendChild(c)
    children(wrap, depth + 1, out)
    return
  }
  // Diagrams: our placeholder, or a plain ```mermaid code block.
  if (t === 'div' && cls(n).includes('mermaid-block')) {
    out.push(`${pad}diagram mermaid`, ...codeLines(n.querySelector('code')?.text ?? '', pad))
    return
  }

  switch (t) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      out.push(`${pad}${t}: ${inlineText(n.childNodes)}`)
      return
    case 'p':
      out.push(`${pad}p: ${inlineText(n.childNodes)}`)
      return
    case 'hr':
      out.push(`${pad}hr`)
      return
    case 'blockquote':
      out.push(`${pad}quote`)
      children(n, depth + 1, out)
      return
    case 'pre': {
      const code = n.querySelector('code')
      const lang = (code?.getAttribute('class') ?? '').match(/language-(\S+)/)?.[1]
      out.push(`${pad}code${lang ? ` lang=${lang}` : ''}`, ...codeLines((code ?? n).text, pad))
      return
    }
    case 'ul':
    case 'ol': {
      const start = n.getAttribute('start')
      out.push(`${pad}${t}${t === 'ol' && start && start !== '1' ? ` start=${start}` : ''}`)
      for (const li of n.childNodes.filter(isEl)) if (tag(li) === 'li') item(li, depth + 1, out)
      return
    }
    case 'table':
      table(n, depth, out)
      return
    default:
      children(n, depth, out) // wrappers (div, section, thead …) add no structure
  }
}

function item(li: HTMLElement, depth: number, out: string[]) {
  const pad = '  '.repeat(depth)
  // A task item's checkbox is its first element, directly or inside its first paragraph.
  const firstEl = (e: HTMLElement) => e.childNodes.find((c) => isEl(c) || (c.nodeType === TEXT && c.text.trim()))
  let first = firstEl(li)
  if (first && isEl(first) && tag(first) === 'p') first = firstEl(first)
  const box = first && isEl(first) && tag(first) === 'input' && first.getAttribute('type') === 'checkbox' ? first : null
  const label = li.getAttribute('data-label')
  out.push(`${pad}li${box ? (box.hasAttribute('checked') ? ' [x]' : ' [ ]') : ''}${label ? ` label=${label}` : ''}`)
  children(li, depth + 1, out)
}

/** A container's children: runs of inline content become one "text:" line (a tight item). */
function children(n: HTMLElement, depth: number, out: string[]) {
  const pad = '  '.repeat(depth)
  let run: Node[] = []
  const flush = () => {
    const s = inlineText(run)
    if (s) out.push(`${pad}text: ${s}`)
    run = []
  }
  for (const c of n.childNodes) {
    if (isEl(c) && (BLOCK.has(tag(c)) || (tag(c) === 'span' && isDisplayMath(c)))) {
      flush()
      blockLines(c, depth, out)
    } else run.push(c)
  }
  flush()
}

function table(n: HTMLElement, depth: number, out: string[]) {
  const pad = '  '.repeat(depth)
  const rows = n.querySelectorAll('tr')
  const head = rows[0]?.querySelectorAll('th') ?? []
  const align = head.map((c) => c.getAttribute('align') ?? c.getAttribute('style')?.match(/text-align:\s*(\w+)/)?.[1] ?? '-')
  out.push(`${pad}table align=${align.join(',')}`)
  for (const r of rows) {
    const cells = r.childNodes.filter(isEl).filter((c) => tag(c) === 'th' || tag(c) === 'td')
    if (!cells.length) continue
    out.push(`${pad}  ${tag(cells[0])}: ${cells.map((c) => inlineText(c.childNodes)).join(' | ')}`)
  }
}

/** The structural outline of a rendered HTML fragment. */
export function outline(html: string, opts: { flat?: boolean } = {}): string {
  // Parse <pre> as markup too (the default keeps it raw, hiding its <code>).
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true } })
  const out: string[] = []
  flat = !!opts.flat
  try {
    children(root as unknown as HTMLElement, 0, out)
  } finally {
    flat = false
  }
  return out.join('\n')
}
