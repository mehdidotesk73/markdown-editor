import type { MarkedExtension, Tokens } from 'marked'

// Lists, read the way people type them, for the preview and the PDF alike.
//
// Markers:   - * +   1. 1)   a. a)   A. A)
// Nesting:   a marker indented 2+ spaces deeper than its list is a list inside
//            the item above it — whatever the markers are, and however wide
//            the parent's marker is. (Plain markdown wants the child under the
//            parent's text, so "2. item\n  a. sub" — two spaces — ran together.)
// Siblings:  same indent (±1) and the same kind of marker. A different kind at
//            the same indent starts a new list.
// Letters:   a lettered list starts at a / A and counts up one letter at a time,
//            so "I. Introduction" or "e. coli" mid-list are text. A top-level
//            lettered list needs two items or a nested list, so a lone
//            "A. Lincoln wrote…" stays a sentence.
// Tasks:     "[ ]" / "[x]" after any marker. A bullet's box replaces the bullet;
//            a numbered or lettered item keeps its number, the box follows it.
// Spacing:   items are always tight (no paragraph gaps), with or without blank
//            lines between them, so every list and every level is spaced alike.
//
// The result is marked's ordinary `list` token, plus `alpha` and `delim`, so
// the PDF export (pdf/markdownToPdf.ts) reads it like any other list.

export type ListKind = 'bullet' | 'decimal' | 'lower' | 'upper'
export type MlList = Tokens.List & { alpha?: 'lower' | 'upper'; delim?: '.' | ')' }

interface Marker {
  indent: number
  kind: ListKind
  delim: '.' | ')' | '-'
  /** Number, or letter position (a = 1). */
  value: number
  text: string
  /** Column where the item's text starts. */
  contentIndent: number
}

const MARKER = /^( *)([-*+]|\d{1,9}[.)]|[a-zA-Z][.)])( +)(\S.*)?$/
const HR = /^ {0,3}([-*_])( *\1){2,} *$/
// Lines that start a block of their own, so they never run on into an item lazily.
const BLOCK_START = /^ {0,3}(#{1,6}( |$)|>|```|~~~|\||\$\$|<)/

function expandTabs(line: string): string {
  return line.replace(/^[ \t]+/, (ws) => ws.replace(/\t/g, '    '))
}

const indentOf = (line: string) => line.length - line.trimStart().length

function parseMarker(line: string): Marker | null {
  if (HR.test(line)) return null
  const m = MARKER.exec(line)
  if (!m || m[4] === undefined) return null
  const [, ws, mark, gap, text] = m
  const indent = ws.length
  // Wide gaps (5+) mean indented code inside the item; the text then starts one space in.
  const contentIndent = indent + mark.length + (gap.length > 4 ? 1 : gap.length)
  const last = mark[mark.length - 1]
  if (/^[-*+]$/.test(mark)) return { indent, kind: 'bullet', delim: '-', value: 0, text, contentIndent }
  if (/^\d/.test(mark)) return { indent, kind: 'decimal', delim: last as '.' | ')', value: parseInt(mark, 10), text, contentIndent }
  const ch = mark[0]
  const upper = ch >= 'A' && ch <= 'Z'
  return {
    indent,
    kind: upper ? 'upper' : 'lower',
    delim: last as '.' | ')',
    value: ch.toLowerCase().charCodeAt(0) - 96,
    text,
    contentIndent,
  }
}

interface Item {
  task: boolean
  checked: boolean
  /** The item's content in order: runs of text lines, and nested lists. */
  parts: (string[] | List)[]
}
interface List {
  indent: number
  kind: ListKind
  delim: string
  start: number
  /** Next value an item of this list must have (letters only). */
  next: number
  items: Item[]
  contentIndent: number
}

const sameKind = (l: List, m: Marker) => l.kind === m.kind && l.delim === m.delim
/** Can this marker open a new list? Lettered lists start at a / A. */
const canStart = (m: Marker) => (m.kind === 'lower' || m.kind === 'upper' ? m.value === 1 : true)
/** Can this marker continue list `l`? */
const continues = (l: List, m: Marker) =>
  sameKind(l, m) && (l.kind === 'lower' || l.kind === 'upper' ? m.value === l.next : true)

function newItem(l: List, m: Marker): Item {
  // "[ ] " / "[x] " after any marker makes a checkbox item.
  const task = /^\[[ xX]\]( |$)/.exec(m.text)
  const text = task ? m.text.slice(3).trimStart() : m.text
  const item: Item = { task: !!task, checked: !!task && task[0][1] !== ' ', parts: [[text]] }
  l.items.push(item)
  l.next = m.value + 1
  l.contentIndent = m.contentIndent
  return item
}

function newList(m: Marker): List {
  const l: List = { indent: m.indent, kind: m.kind, delim: m.delim, start: m.value, next: m.value, items: [], contentIndent: m.contentIndent }
  newItem(l, m)
  return l
}

function addText(item: Item, line: string) {
  const last = item.parts[item.parts.length - 1]
  if (Array.isArray(last)) last.push(line)
  else item.parts.push([line])
}

const lastItem = (l: List) => l.items[l.items.length - 1]

/** Read the list at the start of `src`, if there is one. */
export function scanList(src: string): { raw: string; list: List } | null {
  const rawLines = src.split('\n')
  const lines = rawLines.map(expandTabs)
  const first = parseMarker(lines[0])
  if (!first || first.indent > 3 || !canStart(first)) return null

  const root = newList(first)
  const stack: List[] = [root] // open lists, outermost first
  let used = 1
  let prevBlank = false

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      // A blank line: the list goes on only if something list-like follows.
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j++
      if (j >= lines.length) break
      const next = lines[j]
      const nm = parseMarker(next)
      if (indentOf(next) < 2 && !(nm && nm.indent <= 3 && continuesAnywhere(stack, nm))) break
      prevBlank = true
      continue
    }

    const m = parseMarker(line)
    const top = stack[stack.length - 1]
    if (m) {
      // Deeper than the innermost list: a list inside its last item.
      if (m.indent >= top.indent + 2 && canStart(m)) {
        const child = newList(m)
        lastItem(top).parts.push(child)
        stack.push(child)
        used = i + 1
        prevBlank = false
        continue
      }
      if (m.indent < top.indent + 2) {
        // Find the open list at this marker's level.
        let level = stack.length - 1
        while (level > 0 && m.indent < stack[level].indent - 1) level--
        const l = stack[level]
        if (continues(l, m)) {
          stack.length = level + 1
          newItem(l, m)
          used = i + 1
          prevBlank = false
          continue
        }
        if (canStart(m)) {
          // A different kind of marker at this level: a new list.
          if (level === 0) break // a separate list of its own (the next token)
          stack.length = level
          const parent = stack[level - 1]
          const sibling = newList(m)
          lastItem(parent).parts.push(sibling)
          stack.push(sibling)
          used = i + 1
          prevBlank = false
          continue
        }
      }
      // A letter that fits nowhere (e.g. "e. coli"): just text, below.
    }

    const ind = indentOf(line)
    if (ind < 2) {
      // Unindented text runs on into the item only straight after it.
      if (prevBlank || BLOCK_START.test(line) || HR.test(line)) break
      addText(lastItem(top), line.trim())
      used = i + 1
      continue
    }
    // Indented text: the item of the deepest list it sits inside.
    let level = stack.length - 1
    while (level > 0 && ind < stack[level].indent + 1) level--
    stack.length = level + 1
    const l = stack[level]
    const item = lastItem(l)
    if (prevBlank) addText(item, '')
    addText(item, line.slice(Math.min(ind, l.contentIndent)))
    used = i + 1
    prevBlank = false
  }

  if (root.kind !== 'bullet' && root.kind !== 'decimal' && root.items.length < 2 && root.items[0].parts.length < 2) return null
  let raw = rawLines.slice(0, used).join('\n')
  if (used < rawLines.length) raw += '\n'
  return { raw, list: root }
}

function continuesAnywhere(stack: List[], m: Marker): boolean {
  return stack.some((l) => continues(l, m)) || (m.indent >= 2 && canStart(m))
}

// ---- tokens -----------------------------------------------------------------

type Lexer = { blockTokens(src: string, tokens?: Tokens.Generic[]): Tokens.Generic[]; inlineTokens(src: string): Tokens.Generic[] }

function textToken(lexer: Lexer, text: string): Tokens.Text {
  return { type: 'text', raw: text, text, tokens: lexer.inlineTokens(text) } as Tokens.Text
}

function runTokens(lexer: Lexer, lines: string[]): Tokens.Generic[] {
  const body = lines.join('\n').replace(/\n+$/, '')
  if (!body.trim()) return []
  // Plain lines: one tight run of text. Anything with blank lines or blocks
  // (code fences, quotes…) goes through the block lexer; its first paragraph
  // is still shown tight.
  if (!lines.some((l) => !l.trim() || BLOCK_START.test(l) || /^ {4}/.test(l))) return [textToken(lexer, lines.map((l) => l.trim()).join('\n'))]
  const toks = lexer.blockTokens(body, [])
  if (toks[0]?.type === 'paragraph') {
    const p = toks[0] as Tokens.Paragraph
    toks[0] = { type: 'text', raw: p.raw, text: p.text, tokens: p.tokens } as Tokens.Text
  }
  return toks
}

function toToken(lexer: Lexer, l: List): MlList {
  const items: Tokens.ListItem[] = l.items.map((it) => {
    const tokens: Tokens.Generic[] = []
    for (const part of it.parts) {
      if (Array.isArray(part)) tokens.push(...runTokens(lexer, part))
      else tokens.push(toToken(lexer, part) as unknown as Tokens.Generic)
    }
    const text = it.parts.filter(Array.isArray).flat().join('\n')
    return { type: 'list_item', raw: text, task: it.task, checked: it.task ? it.checked : undefined, loose: false, text, tokens } as Tokens.ListItem
  })
  const token: MlList = {
    type: 'list',
    raw: '',
    ordered: l.kind !== 'bullet',
    start: l.kind === 'bullet' ? '' : l.start,
    loose: false,
    items,
  }
  if (l.kind === 'lower' || l.kind === 'upper') token.alpha = l.kind
  if (l.kind !== 'bullet') token.delim = l.delim as '.' | ')'
  return token
}

export const listExtension: MarkedExtension = {
  extensions: [
    {
      name: 'mlList',
      level: 'block',
      // Where a list may interrupt a paragraph: bullets, "1." / "1)", "a)" / "A.".
      start(src: string) {
        const m = /(^|\n) {0,3}([-*+]|1[.)]|[aA][.)]) +\S/.exec(src)
        return m ? m.index + m[1].length : undefined
      },
      tokenizer(src: string) {
        const found = scanList(src)
        if (!found) return undefined
        const token = toToken(this.lexer as unknown as Lexer, found.list)
        token.raw = found.raw
        return token as unknown as Tokens.Generic
      },
    },
  ],
  renderer: {
    list(token: Tokens.List) {
      const l = token as MlList
      const tag = l.ordered ? 'ol' : 'ul'
      const cls: string[] = []
      let attrs = ''
      if (l.alpha) {
        cls.push(`alpha-${l.alpha}`)
        attrs += ` type="${l.alpha === 'upper' ? 'A' : 'a'}"`
      }
      if (l.delim === ')') cls.push('paren')
      if (l.ordered && typeof l.start === 'number' && l.start !== 1) attrs += ` start="${l.start}"`
      if (cls.length) attrs += ` class="${cls.join(' ')}"`
      const body = l.items
        .map((it) => {
          const box = it.task ? `<input type="checkbox" disabled${it.checked ? ' checked' : ''}> ` : ''
          const inner = this.parser.parse(it.tokens.filter((t) => t.type !== 'checkbox'))
          return `<li${it.task ? ' class="task"' : ''}>${box}${inner.trim()}</li>\n`
        })
        .join('')
      return `<${tag}${attrs}>\n${body}</${tag}>\n`
    },
  },
}
