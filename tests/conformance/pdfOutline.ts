// The PDF's layout plan (the pdfmake document definition from markdownToPdf.ts)
// → the same structural outline as outline.ts, in its "flat" inline form. Every
// plan node carries an `ml` tag saying what it is; runs carry their marks
// (bold, italics, strike, Mono = code, link, and tagged math / images).

import type { Content } from '../../src/lib/pdf/markdownToPdf'
import { codeLines, serializeSegs, type Seg } from './outline'

type N = Record<string, unknown>

const isNode = (c: unknown): c is N => !!c && typeof c === 'object' && !Array.isArray(c)

/** pdfmake text runs → flat segments. */
function segs(text: unknown): Seg[] {
  if (typeof text === 'string') return [{ marks: [], text: text === '\n' ? '⏎' : text, raw: text === '\n' }]
  if (Array.isArray(text)) return text.flatMap(segs)
  if (!isNode(text)) return []
  if (Array.isArray(text.text)) return segs(text.text)
  const t = String(text.text ?? '')
  const link = typeof text.link === 'string' ? [`a=${text.link}`] : []
  if (text.ml === 'math') return [{ marks: [...link, 'm'], text: String(text.mlText), raw: true }]
  if (text.ml === 'img') return [{ marks: [...link, `img=${text.mlSrc}`], text: String(text.mlText), raw: true }]
  if (t === '\n') return [{ marks: [], text: '⏎', raw: true }]
  const marks: string[] = [...link]
  if (text.bold) marks.push('b')
  if (text.italics) marks.push('i')
  if (text.decoration === 'lineThrough') marks.push('s')
  if (text.font === 'Mono') return [{ marks: [...marks, 'c'], text: t, raw: true }]
  return [{ marks, text: t, raw: false }]
}

/** Runs → segments, undoing the zero-width break points added to long words in tables. */
function inlineSegs(text: unknown): Seg[] {
  const out: Seg[] = []
  const walkRuns = (t: unknown) => {
    if (Array.isArray(t)) return t.forEach(walkRuns)
    if (isNode(t) && Array.isArray(t.text)) return walkRuns(t.text)
    if (isNode(t) && t.ml === 'break') return
    for (const s of segs(t)) {
      s.text = s.text.replace(/\u200B/g, '')
      const last = out[out.length - 1]
      if (isNode(t) && t.mlJoin && last) last.text += s.text
      else out.push(s)
    }
  }
  walkRuns(text)
  return out
}

const inlineOf = (text: unknown) => serializeSegs(inlineSegs(text))

/** The children of a list item, wherever the plan put them (plain, beside a box or label). */
function itemChildren(item: N): Content[] {
  if (Array.isArray(item.columns)) return ((item.columns[1] as N).stack as Content[]) ?? []
  const stack = (item.stack as Content[]) ?? []
  const first = stack[0]
  if (isNode(first) && Array.isArray(first.columns) && first.ml === undefined)
    return [...(((first.columns[1] as N).stack as Content[]) ?? []), ...stack.slice(1)]
  return stack
}

function walk(c: Content, depth: number, out: string[], tight: boolean) {
  if (Array.isArray(c)) {
    for (const x of c) walk(x, depth, out, tight)
    return
  }
  if (!isNode(c)) return
  const pad = '  '.repeat(depth)
  switch (c.ml) {
    case 'heading':
      out.push(`${pad}h${c.headlineLevel}: ${inlineOf(c.text)}`)
      return
    case 'rule':
    case 'alert-title':
    case 'lead':
      return
    case 'p':
    case 'html':
      out.push(`${pad}${tight ? 'text' : 'p'}: ${inlineOf(c.text)}`)
      return
    case 'image': {
      const line = serializeSegs([{ marks: [`img=${c.mlSrc}`], text: String(c.mlText), raw: true }])
      out.push(`${pad}${tight ? 'text' : 'p'}: ${line}`)
      return
    }
    case 'code':
      out.push(`${pad}code${c.mlLang ? ` lang=${c.mlLang}` : ''}`, ...codeLines(String(c.mlText) + '\n', pad))
      return
    case 'diagram':
      out.push(`${pad}diagram mermaid`, ...codeLines(String(c.mlText) + '\n', pad))
      return
    case 'math':
      out.push(`${pad}math-block: ${String(c.mlText).replace(/[ \t\r\n]+/g, ' ').trim()}`)
      return
    case 'hr':
      out.push(`${pad}hr`)
      return
    case 'quote':
    case 'alert': {
      out.push(c.ml === 'alert' ? `${pad}alert ${c.mlAlert}` : `${pad}quote`)
      const cell = ((c.table as N).body as N[][])[0][0]
      walk(cell.stack as Content[], depth + 1, out, false)
      return
    }
    case 'list': {
      const start = c.mlOrdered && c.mlStart !== 1 ? ` start=${c.mlStart}` : ''
      out.push(`${pad}${c.mlOrdered ? 'ol' : 'ul'}${start}`)
      const items = (c.ol ?? c.ul ?? c.stack) as N[]
      for (const item of items) {
        const box = item.mlChecked === true ? ' [x]' : item.mlChecked === false ? ' [ ]' : ''
        const label = item.mlLabel != null ? ` label=${item.mlLabel}` : ''
        out.push(`${pad}  li${box}${label}`)
        walk(itemChildren(item), depth + 2, out, !!c.mlTight)
      }
      return
    }
    case 'table': {
      const align = (c.mlAlign as (string | null)[]).map((x) => x ?? '-')
      out.push(`${pad}table align=${align.join(',')}`)
      const body = (c.table as N).body as N[][]
      body.forEach((row, r) => out.push(`${pad}  ${r === 0 ? 'th' : 'td'}: ${row.map((cell) => inlineOf(cell.text)).join(' | ')}`))
      return
    }
    default:
      // Untagged wrappers (stacks, columns) add no structure.
      if (Array.isArray(c.stack)) walk(c.stack as Content[], depth, out, tight)
  }
}

/** The structural outline of a PDF layout plan's content. */
export function pdfOutline(content: Content[]): string {
  const out: string[] = []
  walk(content, 0, out, false)
  return out.join('\n')
}
