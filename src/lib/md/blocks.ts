// Block parsing: the CommonMark line-by-line algorithm. Every line is matched
// against the stack of open containers (document → quotes → lists → items),
// each of which has one rule for "does this line continue me?"; then new
// blocks are started; then the rest of the line is added to the innermost
// block. Leaves (paragraphs, headings, code, math, HTML, tables, rules) hold
// raw text until the whole document is read, when inlines are parsed — so a
// reference defined at the end can be used at the start.
//
// GFM adds tables and task items; our additions are math blocks ($$ … $$ and
// ```math, A2), bullet labels ("- {1.1}", A3) and alerts ("> [!NOTE]", A5).

import { Block, type BlockType, type ListData, type Align, type LinkRef } from './ast'
import { InlineParser } from './inlines'
import { isSpaceOrTab, unescapeString } from './common'

const CODE_INDENT = 4
const reNonSpace = /[^ \t\f\v\r\n]/
const reMaybeSpecial = /^[#`~*+_=<>0-9-|$:]/
const reATXHeadingMarker = /^#{1,6}(?:[ \t]+|$)/
const reCodeFence = /^`{3,}(?!.*`)|^~{3,}/
const reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/
const reMathFence = /^\${2,}(?![^\n]*\$)/
const reSetextHeadingLine = /^(?:=+|-+)[ \t]*$/
const reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/
const reBulletListMarker = /^[*+-]/
const reOrderedListMarker = /^(\d{1,9})([.)])/
const reTableDelimiterRow = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const reTaskMarker = /^\[([ xX])\](?=[ \t]|$)/
const reLabel = /^\{([^{}\s][^{}]*)\}[ \t]+(?=\S)/
const reAlertLine = /^\[!(note|tip|important|warning|caution)\][ \t]*$/i

const reHtmlBlockOpen = [
  /./, // dummy for 0
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/i,
  /^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*[>])\s*$/,
]
const reHtmlBlockClose = [
  /./,
  /<\/(?:script|pre|textarea|style)>/i,
  /-->/,
  /\?>/,
  />/,
  /\]\]>/,
]

const acceptsLines = (t: BlockType) => t === 'paragraph' || t === 'code' || t === 'html' || t === 'math'

function canContain(parent: BlockType, child: BlockType): boolean {
  switch (parent) {
    case 'document':
    case 'blockquote':
      return child !== 'item'
    case 'list':
      return child === 'item'
    case 'item':
      return child !== 'item'
    default:
      return false
  }
}

/** Split a table row into its cells (escaped pipes stay "\|" until the cell is parsed). */
export function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '\\|'
      i++
    } else if (s[i] === '|') {
      cells.push(cur.trim())
      cur = ''
    } else cur += s[i]
  }
  cells.push(cur.trim())
  return cells
}

export interface ParseResult {
  doc: Block
  refmap: Map<string, LinkRef>
}

export class BlockParser {
  private doc!: Block
  private tip!: Block
  private oldtip!: Block
  private line = ''
  private lineNumber = 0
  private offset = 0
  private column = 0
  private nextNonspace = 0
  private nextNonspaceColumn = 0
  private indent = 0
  private indented = false
  private blank = false
  private partiallyConsumedTab = false
  private allClosed = true
  private lastMatchedContainer!: Block
  private refmap = new Map<string, LinkRef>()
  private inline = new InlineParser(this.refmap)

  parse(input: string): ParseResult {
    this.doc = new Block('document', 1)
    this.tip = this.doc
    this.oldtip = this.doc
    this.lineNumber = 0
    this.refmap.clear()
    const lines = input.replace(/\0/g, '�').split(/\r\n|\n|\r/)
    let len = lines.length
    if (input.endsWith('\n') || input.endsWith('\r')) len--
    for (let i = 0; i < len; i++) this.incorporateLine(lines[i])
    while (this.tip) {
      const parent = this.tip.parent
      this.finalize(this.tip, len)
      if (!parent) break
      this.tip = parent
    }
    this.postprocess(this.doc)
    return { doc: this.doc, refmap: this.refmap }
  }

  // ---- the line scanner ------------------------------------------------------

  private peek(at = this.offset): string | undefined {
    return this.line[at]
  }

  private findNextNonspace() {
    let i = this.offset
    let cols = this.column
    let c: string | undefined
    while ((c = this.line[i]) !== undefined) {
      if (c === ' ') {
        i++
        cols++
      } else if (c === '\t') {
        i++
        cols += 4 - (cols % 4)
      } else break
    }
    this.blank = c === undefined || c === '\n' || c === '\r'
    this.nextNonspace = i
    this.nextNonspaceColumn = cols
    this.indent = this.nextNonspaceColumn - this.column
    this.indented = this.indent >= CODE_INDENT
  }

  private advanceNextNonspace() {
    this.offset = this.nextNonspace
    this.column = this.nextNonspaceColumn
    this.partiallyConsumedTab = false
  }

  private advanceOffset(count: number, columns: boolean) {
    let c: string | undefined
    while (count > 0 && (c = this.line[this.offset]) !== undefined) {
      if (c === '\t') {
        const charsToTab = 4 - (this.column % 4)
        if (columns) {
          this.partiallyConsumedTab = charsToTab > count
          const charsToAdvance = charsToTab > count ? count : charsToTab
          this.column += charsToAdvance
          this.offset += this.partiallyConsumedTab ? 0 : 1
          count -= charsToAdvance
        } else {
          this.partiallyConsumedTab = false
          this.column += charsToTab
          this.offset += 1
          count -= 1
        }
      } else {
        this.partiallyConsumedTab = false
        this.offset += 1
        this.column += 1
        count -= 1
      }
    }
  }

  private addLine() {
    if (this.partiallyConsumedTab) {
      this.offset += 1
      const charsToTab = 4 - (this.column % 4)
      this.tip.content += ' '.repeat(charsToTab)
    }
    this.tip.content += this.line.slice(this.offset) + '\n'
  }

  private addChild(type: BlockType, offset: number): Block {
    void offset
    while (!canContain(this.tip.type, type)) this.finalize(this.tip, this.lineNumber - 1)
    const b = new Block(type, this.lineNumber)
    this.tip.append(b)
    this.tip = b
    return b
  }

  private closeUnmatchedBlocks() {
    if (this.allClosed) return
    while (this.oldtip !== this.lastMatchedContainer) {
      const parent = this.oldtip.parent!
      this.finalize(this.oldtip, this.lineNumber - 1)
      this.oldtip = parent
    }
    this.allClosed = true
  }

  // ---- continuation: does this line continue the open block? (0 yes, 1 no, 2 consumed)

  private continues(b: Block): 0 | 1 | 2 {
    switch (b.type) {
      case 'document':
      case 'list':
        return 0
      case 'blockquote':
        if (!this.indented && this.peek(this.nextNonspace) === '>') {
          this.advanceNextNonspace()
          this.advanceOffset(1, false)
          if (isSpaceOrTab(this.peek())) this.advanceOffset(1, true)
          return 0
        }
        return 1
      case 'item': {
        const ld = b.list!
        if (this.blank) {
          if (b.children.length === 0) return 1 // a blank line after an empty item's marker ends it
          this.advanceNextNonspace()
        } else if (this.indent >= ld.markerOffset + ld.padding) {
          this.advanceOffset(ld.markerOffset + ld.padding, true)
        } else return 1
        return 0
      }
      case 'heading':
      case 'hr':
        return 1
      case 'code':
        if (b.fenced) {
          const m = this.indent <= 3 && this.peek(this.nextNonspace) === b.fenceChar ? this.line.slice(this.nextNonspace).match(reClosingCodeFence) : null
          if (m && m[0].length >= b.fenceLength) {
            this.finalize(b, this.lineNumber)
            return 2
          }
          let i = b.fenceOffset
          while (i > 0 && isSpaceOrTab(this.peek())) {
            this.advanceOffset(1, true)
            i--
          }
        } else if (this.indent >= CODE_INDENT) this.advanceOffset(CODE_INDENT, true)
        else if (this.blank) this.advanceNextNonspace()
        else return 1
        return 0
      case 'math': {
        const m = this.indent <= 3 ? /^\${2,}(?=[ \t]*$)/.exec(this.line.slice(this.nextNonspace)) : null
        if (m && m[0].length >= b.fenceLength) {
          this.finalize(b, this.lineNumber)
          return 2
        }
        let i = b.fenceOffset
        while (i > 0 && isSpaceOrTab(this.peek())) {
          this.advanceOffset(1, true)
          i--
        }
        return 0
      }
      case 'html':
        return this.blank && (b.htmlType === 6 || b.htmlType === 7) ? 1 : 0
      case 'paragraph':
      case 'table':
        return this.blank ? 1 : 0
      default:
        return 1
    }
  }

  // ---- block starts (0 none, 1 container, 2 leaf) --------------------------------

  private starts: ((container: Block) => 0 | 1 | 2)[] = [
    // block quote
    () => {
      if (this.indented || this.peek(this.nextNonspace) !== '>') return 0
      this.advanceNextNonspace()
      this.advanceOffset(1, false)
      if (isSpaceOrTab(this.peek())) this.advanceOffset(1, true)
      this.closeUnmatchedBlocks()
      this.addChild('blockquote', this.nextNonspace)
      return 1
    },
    // ATX heading
    () => {
      let m: RegExpMatchArray | null
      if (this.indented || !(m = this.line.slice(this.nextNonspace).match(reATXHeadingMarker))) return 0
      this.advanceNextNonspace()
      this.advanceOffset(m[0].length, false)
      this.closeUnmatchedBlocks()
      const h = this.addChild('heading', this.nextNonspace)
      h.level = m[0].trim().length
      h.content = this.line
        .slice(this.offset)
        .replace(/^[ \t]*#+[ \t]*$/, '')
        .replace(/[ \t]+#+[ \t]*$/, '')
      this.advanceOffset(this.line.length - this.offset, false)
      return 2
    },
    // fenced code
    () => {
      let m: RegExpMatchArray | null
      if (this.indented || !(m = this.line.slice(this.nextNonspace).match(reCodeFence))) return 0
      const fenceLength = m[0].length
      this.closeUnmatchedBlocks()
      const c = this.addChild('code', this.nextNonspace)
      c.fenced = true
      c.fenceLength = fenceLength
      c.fenceChar = m[0][0]
      c.fenceOffset = this.indent
      this.advanceNextNonspace()
      this.advanceOffset(fenceLength, false)
      return 2
    },
    // math block ($$ … $$) — A2
    () => {
      let m: RegExpMatchArray | null
      if (this.indented || !(m = this.line.slice(this.nextNonspace).match(reMathFence))) return 0
      const fenceLength = m[0].length
      this.closeUnmatchedBlocks()
      const c = this.addChild('math', this.nextNonspace)
      c.fenced = true
      c.fenceLength = fenceLength
      c.fenceOffset = this.indent
      this.advanceNextNonspace()
      this.advanceOffset(fenceLength, false)
      return 2
    },
    // HTML block
    (container) => {
      if (this.indented || this.peek(this.nextNonspace) !== '<') return 0
      const s = this.line.slice(this.nextNonspace)
      for (let t = 1; t <= 7; t++) {
        if (reHtmlBlockOpen[t].test(s) && (t < 7 || (container.type !== 'paragraph' && !(!this.allClosed && !this.blank && this.tip.type === 'paragraph')))) {
          this.closeUnmatchedBlocks()
          const b = this.addChild('html', this.offset)
          b.htmlType = t
          return 2
        }
      }
      return 0
    },
    // GFM table: a paragraph's last line is the header, this line the delimiter row
    (container) => {
      if (this.indented || container.type !== 'paragraph' || container !== this.tip) return 0
      const delim = this.line.slice(this.nextNonspace)
      if (!reTableDelimiterRow.test(delim)) return 0
      const lines = container.content.replace(/\n$/, '').split('\n')
      const header = lines[lines.length - 1]
      if (!header.includes('|') && !delim.includes('|')) return 0
      const headCells = splitRow(header)
      const delimCells = splitRow(delim)
      if (headCells.length !== delimCells.length) return 0
      this.closeUnmatchedBlocks()
      const rest = lines.slice(0, -1)
      const table = new Block('table', this.lineNumber - 1)
      table.align = delimCells.map((d): Align => {
        const l = d.startsWith(':')
        const r = d.endsWith(':')
        return l && r ? 'center' : l ? 'left' : r ? 'right' : null
      })
      table.rawRows = [headCells]
      const parent = container.parent!
      if (rest.length && rest.some((l) => l.trim())) {
        container.content = rest.join('\n') + '\n'
        this.finalize(container, this.lineNumber - 2)
      } else {
        container.remove()
      }
      parent.append(table)
      this.tip = table
      this.advanceOffset(this.line.length - this.offset, false)
      return 2
    },
    // setext heading
    (container) => {
      let m: RegExpMatchArray | null
      if (this.indented || container.type !== 'paragraph' || !(m = this.line.slice(this.nextNonspace).match(reSetextHeadingLine))) return 0
      this.closeUnmatchedBlocks()
      // Reference definitions at the start of the paragraph aren't part of the heading.
      let pos: number
      while (container.content[0] === '[' && (pos = this.inline.parseReference(container.content))) container.content = container.content.slice(pos)
      if (container.content.length === 0 || !reNonSpace.test(container.content)) return 0
      const h = new Block('heading', container.startLine)
      h.level = m[0][0] === '=' ? 1 : 2
      h.content = container.content
      const parent = container.parent!
      parent.children[parent.children.indexOf(container)] = h
      h.parent = parent
      this.tip = h
      this.advanceOffset(this.line.length - this.offset, false)
      return 2
    },
    // thematic break
    () => {
      if (this.indented || !reThematicBreak.test(this.line.slice(this.nextNonspace))) return 0
      this.closeUnmatchedBlocks()
      this.addChild('hr', this.nextNonspace)
      this.advanceOffset(this.line.length - this.offset, false)
      return 2
    },
    // list item
    (container) => {
      if (this.indented && container.type !== 'list') return 0
      const data = this.parseListMarker(container)
      if (!data) return 0
      this.closeUnmatchedBlocks()
      if (this.tip.type !== 'list' || !listsMatch(container.list, data)) {
        const list = this.addChild('list', this.nextNonspace)
        list.list = data
      }
      const item = this.addChild('item', this.nextNonspace)
      item.list = data
      return 1
    },
    // indented code
    () => {
      if (!this.indented || this.tip.type === 'paragraph' || this.blank) return 0
      this.advanceOffset(CODE_INDENT, true)
      this.closeUnmatchedBlocks()
      this.addChild('code', this.offset)
      return 2
    },
  ]

  private parseListMarker(container: Block): ListData | null {
    if (this.indent >= 4) return null
    const rest = this.line.slice(this.nextNonspace)
    let data: ListData
    let m: RegExpMatchArray | null
    if ((m = rest.match(reBulletListMarker))) {
      data = { ordered: false, marker: m[0][0], start: 1, markerOffset: this.indent, padding: 0 }
    } else if ((m = rest.match(reOrderedListMarker)) && (container.type !== 'paragraph' || m[1] === '1')) {
      data = { ordered: true, marker: m[2], start: parseInt(m[1], 10), markerOffset: this.indent, padding: 0 }
    } else return null
    const next = this.line[this.nextNonspace + m[0].length]
    if (!(next === undefined || next === '\t' || next === ' ')) return null
    // An empty item can't interrupt a paragraph.
    if (container.type === 'paragraph' && !reNonSpace.test(this.line.slice(this.nextNonspace + m[0].length))) return null

    this.advanceNextNonspace()
    this.advanceOffset(m[0].length, true)
    const spacesStartCol = this.column
    const spacesStartOffset = this.offset
    let nextc: string | undefined
    do {
      this.advanceOffset(1, true)
      nextc = this.peek()
    } while (this.column - spacesStartCol < 5 && isSpaceOrTab(nextc))
    const blankItem = nextc === undefined
    const spacesAfterMarker = this.column - spacesStartCol
    if (spacesAfterMarker >= 5 || spacesAfterMarker < 1 || blankItem) {
      data.padding = m[0].length + 1
      this.column = spacesStartCol
      this.offset = spacesStartOffset
      if (isSpaceOrTab(this.peek())) this.advanceOffset(1, true)
    } else data.padding = m[0].length + spacesAfterMarker
    return data
  }

  // ---- one line --------------------------------------------------------------

  private incorporateLine(ln: string) {
    let container: Block = this.doc
    this.oldtip = this.tip
    this.offset = 0
    this.column = 0
    this.blank = false
    this.partiallyConsumedTab = false
    this.lineNumber++
    this.line = ln

    // 1. Which open blocks does this line continue?
    let last: Block | undefined
    let consumed = false
    while ((last = container.last) && last.open) {
      container = last
      this.findNextNonspace()
      const r = this.continues(container)
      if (r === 1) {
        container = container.parent!
        break
      }
      if (r === 2) {
        consumed = true
        break
      }
    }
    if (consumed) return
    this.allClosed = container === this.oldtip
    this.lastMatchedContainer = container

    // 2. New blocks.
    let matchedLeaf = container.type !== 'paragraph' && acceptsLines(container.type)
    while (!matchedLeaf) {
      this.findNextNonspace()
      if (!this.indented && !reMaybeSpecial.test(this.line.slice(this.nextNonspace))) {
        this.advanceNextNonspace()
        break
      }
      let i = 0
      for (; i < this.starts.length; i++) {
        const r = this.starts[i](container)
        if (r === 1) {
          container = this.tip
          break
        }
        if (r === 2) {
          container = this.tip
          matchedLeaf = true
          break
        }
      }
      if (i === this.starts.length) {
        this.advanceNextNonspace()
        break
      }
    }

    // 3. The rest of the line is text for the innermost block.
    if (!this.allClosed && !this.blank && this.tip.type === 'paragraph') {
      this.addLine() // lazy continuation
    } else {
      this.closeUnmatchedBlocks()
      const t = container.type
      if (acceptsLines(t)) {
        if (!(container.content === '' && container.fenced && container.startLine === this.lineNumber)) this.addLine()
        else container.info = unescapeString(this.line.slice(this.offset).trim())
        if (t === 'html' && container.htmlType >= 1 && container.htmlType <= 5 && reHtmlBlockClose[container.htmlType].test(this.line.slice(this.offset)))
          this.finalize(container, this.lineNumber)
      } else if (t === 'table') {
        // (On the delimiter row itself the offset is already at the end of the line.)
        if (!this.blank && this.offset < ln.length) container.rawRows.push(splitRow(this.line.slice(this.offset)))
      } else if (this.offset < ln.length && !this.blank) {
        container = this.addChild('paragraph', this.offset)
        this.advanceNextNonspace()
        this.addLine()
      }
    }
  }

  // ---- closing a block -----------------------------------------------------------

  private finalize(b: Block, lineNumber: number) {
    const above = b.parent
    b.open = false
    b.endLine = lineNumber
    switch (b.type) {
      case 'paragraph': {
        let pos: number
        let hadRefs = false
        while (b.content[0] === '[' && (pos = this.inline.parseReference(b.content))) {
          b.content = b.content.slice(pos)
          hadRefs = true
        }
        if (hadRefs && !reNonSpace.test(b.content)) b.remove()
        else {
          // D2: a paragraph that is only "$$ tex $$" is display math.
          const one = /^\$\$[ \t]*([^\n$]*[^\s$][^\n$]*?)[ \t]*\$\$$/.exec(b.content.trim())
          if (one && !b.content.trim().includes('\n')) {
            b.type = 'math'
            b.content = one[1]
          }
        }
        break
      }
      case 'code':
        if (b.fenced) {
          if (b.info.split(/\s+/)[0] === 'math') {
            b.type = 'math'
          }
        } else b.content = b.content.replace(/(\n *)+$/, '\n')
        break
      case 'item':
        b.endLine = b.last ? b.last.endLine : b.startLine
        break
      case 'list': {
        b.tight = true
        const ends = (x: Block, next: Block | undefined) => next !== undefined && x.endLine !== next.startLine - 1
        outer: for (let i = 0; i < b.children.length; i++) {
          const item = b.children[i]
          if (ends(item, b.children[i + 1])) {
            b.tight = false
            break
          }
          for (let j = 0; j < item.children.length; j++)
            if (ends(item.children[j], item.children[j + 1])) {
              b.tight = false
              break outer
            }
        }
        b.endLine = b.last ? b.last.endLine : b.endLine
        break
      }
    }
    if (above) this.tip = above
  }

  // ---- after the whole document: tasks, labels, alerts, then inlines -----------

  private postprocess(doc: Block) {
    const walk = (b: Block) => {
      if (b.type === 'item') this.itemMarkers(b)
      for (const c of [...b.children]) walk(c)
    }
    walk(doc)
    for (const q of doc.children) if (q.type === 'blockquote') this.alertOf(q)
    this.parseInlines(doc)
  }

  /** GFM task marker "[ ]" / "[x]"; A3 label "{1.1}" on a bullet item. */
  private itemMarkers(item: Block) {
    const p = item.children[0]
    if (!p || p.type !== 'paragraph' || p.startLine !== item.startLine) return
    const task = reTaskMarker.exec(p.content)
    if (task && /\S/.test(p.content.slice(task[0].length))) {
      item.checked = task[1] !== ' '
      p.content = p.content.slice(task[0].length).replace(/^[ \t]/, '')
      return
    }
    if (item.list && !item.list.ordered) {
      const lab = reLabel.exec(p.content)
      if (lab) {
        item.label = lab[1]
        p.content = p.content.slice(lab[0].length)
      }
    }
  }

  /** A5: a top-level quote whose first line is exactly "[!NOTE]" (etc.) is an alert. */
  private alertOf(q: Block) {
    const p = q.children[0]
    if (!p || p.type !== 'paragraph' || p.startLine !== q.startLine) return
    const nl = p.content.indexOf('\n')
    const first = nl < 0 ? p.content : p.content.slice(0, nl)
    const m = reAlertLine.exec(first)
    if (!m) return
    q.type = 'alert'
    q.alert = m[1].toLowerCase()
    p.content = nl < 0 ? '' : p.content.slice(nl + 1)
    if (!reNonSpace.test(p.content)) p.remove()
  }

  private parseInlines(b: Block) {
    if (b.type === 'paragraph' || b.type === 'heading') b.inlines = this.inline.parse(b.content)
    else if (b.type === 'table') {
      const width = b.align.length
      b.rows = b.rawRows.map((cells) =>
        Array.from({ length: width }, (_, i) => this.inline.parse((cells[i] ?? '').replace(/\\\|/g, '|'))),
      )
    }
    for (const c of b.children) this.parseInlines(c)
  }
}

function listsMatch(a: ListData | null, b: ListData): boolean {
  return !!a && a.ordered === b.ordered && a.marker === b.marker
}
