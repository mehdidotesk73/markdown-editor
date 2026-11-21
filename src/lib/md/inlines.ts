// Inline parsing: the CommonMark inline algorithm (code spans, the delimiter
// stack for emphasis, link and image brackets, autolinks, entities, escapes,
// breaks) plus GFM strikethrough and autolink literals, and our math (A2):
// "$$…$$" spans like a code span, and a single "$" by Pandoc's rule.

import type { Inline, LinkRef } from './ast'
import {
  ESCAPABLE,
  decodeEntity,
  isPunctuation,
  isUnicodeWhitespace,
  normalizeLabel,
  normalizeUri,
  reEntityHere,
  reHtmlTag,
  unescapeString,
} from './common'

// A mutable node while parsing; finished into the plain Inline tree at the end.
interface Node {
  type: Inline['type']
  value?: string
  /** Text from a backslash escape: GFM autolink literals don't run through it. */
  escaped?: boolean
  href?: string
  title?: string
  children?: Node[]
}

interface Delimiter {
  cc: string
  numdelims: number
  origdelims: number
  node: Node
  previous: Delimiter | null
  next: Delimiter | null
  canOpen: boolean
  canClose: boolean
}

interface Bracket {
  node: Node
  previous: Bracket | null
  previousDelimiter: Delimiter | null
  index: number
  image: boolean
  active: boolean
  bracketAfter: boolean
}

const reEscapable = new RegExp(`^${ESCAPABLE}`)
const reLinkLabel = /^\[(?:[^\\[\]]|\\[\s\S]){0,1000}\]/
const reLinkTitle = /^(?:"(\\[\s\S]|[^"\x00])*"|'(\\[\s\S]|[^'\x00])*'|\((\\[\s\S]|[^()\x00])*\))/
const reLinkDestinationBraces = /^<(?:[^<>\n\\\x00]|\\.)*>/
const reAutolink = /^<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/
const reEmailAutolink =
  /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/
const reTicksHere = /^`+/
const reTicks = /`+/g
const reSpnl = /^ *(?:\n *)?/
const reFinalSpace = / *$/
const reInitialSpace = /^ */
const reMain = /^[^\n`[\]\\!<&*_~$]+/

export class InlineParser {
  private subject = ''
  private pos = 0
  private delimiters: Delimiter | null = null
  private brackets: Bracket | null = null
  private nodes: Node[] = []

  constructor(private refmap: Map<string, LinkRef>) {}

  /** Parse a paragraph's (or heading's, or cell's) text into inline nodes. */
  parse(text: string): Inline[] {
    this.subject = text.trim()
    this.pos = 0
    this.delimiters = null
    this.brackets = null
    this.nodes = []
    while (this.pos < this.subject.length) this.parseInline()
    this.processEmphasis(null)
    return finish(autolinkLiterals(mergeText(this.nodes)))
  }

  // ---- reference definitions ([label]: dest "title") -------------------------

  /** Try to read one reference definition at the start of `text`; returns its length or 0. */
  parseReference(text: string): number {
    this.subject = text
    this.pos = 0
    const startpos = 0
    const matchChars = this.parseLinkLabel()
    if (matchChars === 0) return 0
    const rawlabel = this.subject.slice(0, matchChars)
    if (this.peek() === ':') this.pos++
    else return 0
    this.spnl()
    const dest = this.parseLinkDestination()
    if (dest === null) return 0
    const beforetitle = this.pos
    this.spnl()
    let title: string | null = null
    if (this.pos !== beforetitle) title = this.parseLinkTitle()
    if (title === null) {
      title = ''
      this.pos = beforetitle
    }
    let atLineEnd = true
    if (this.match(/^[ \t]*(?:\n|$)/) === null) {
      if (title === '') atLineEnd = false
      else {
        title = ''
        this.pos = beforetitle
        atLineEnd = this.match(/^[ \t]*(?:\n|$)/) !== null
      }
    }
    if (!atLineEnd) return 0
    const label = normalizeLabel(rawlabel.slice(1, -1))
    if (label === '') return 0
    if (!this.refmap.has(label)) this.refmap.set(label, { href: dest, title })
    return this.pos - startpos
  }

  // ---- the scanner -----------------------------------------------------------

  private peek(): string | undefined {
    return this.subject[this.pos]
  }

  private match(re: RegExp): string | null {
    const m = re.exec(this.subject.slice(this.pos))
    if (!m) return null
    this.pos += m.index + m[0].length
    return m[0]
  }

  private spnl() {
    this.match(reSpnl)
    return true
  }

  private text(s: string): Node {
    const n: Node = { type: 'text', value: s }
    this.nodes.push(n)
    return n
  }

  private parseInline() {
    const c = this.peek()!
    let ok = false
    switch (c) {
      case '\n':
        ok = this.parseNewline()
        break
      case '\\':
        ok = this.parseBackslash()
        break
      case '`':
        ok = this.parseBackticks()
        break
      case '*':
      case '_':
      case '~':
        ok = this.handleDelim(c)
        break
      case '[':
        ok = this.parseOpenBracket()
        break
      case '!':
        ok = this.parseBang()
        break
      case ']':
        ok = this.parseCloseBracket()
        break
      case '<':
        ok = this.parseAutolink() || this.parseHtmlTag()
        break
      case '&':
        ok = this.parseEntity()
        break
      case '$':
        ok = this.parseMath()
        break
      default:
        ok = this.parseString()
    }
    if (!ok) {
      this.pos++
      this.text(c)
    }
  }

  private parseString(): boolean {
    const m = this.match(reMain)
    if (m === null) return false
    this.text(m)
    return true
  }

  private parseNewline(): boolean {
    this.pos++
    const last = this.nodes[this.nodes.length - 1]
    if (last && last.type === 'text' && last.value!.endsWith(' ')) {
      const hard = last.value!.endsWith('  ')
      last.value = last.value!.replace(reFinalSpace, '')
      this.nodes.push({ type: hard ? 'hardbreak' : 'softbreak' })
    } else this.nodes.push({ type: 'softbreak' })
    this.match(reInitialSpace)
    return true
  }

  private parseBackslash(): boolean {
    this.pos++
    const c = this.peek()
    if (c === '\n') {
      this.pos++
      this.nodes.push({ type: 'hardbreak' })
    } else if (c !== undefined && reEscapable.test(c)) {
      this.pos++
      this.nodes.push({ type: 'text', value: c, escaped: true })
    } else this.text('\\')
    return true
  }

  private parseBackticks(): boolean {
    const ticks = this.match(reTicksHere)
    if (ticks === null) return false
    const afterOpen = this.pos
    let m: RegExpExecArray | null
    reTicks.lastIndex = afterOpen
    while ((m = reTicks.exec(this.subject)) !== null) {
      if (m[0] === ticks) {
        let contents = this.subject.slice(afterOpen, m.index).replace(/\n/g, ' ')
        if (contents.length > 0 && /[^ ]/.test(contents) && contents[0] === ' ' && contents[contents.length - 1] === ' ')
          contents = contents.slice(1, -1)
        this.pos = m.index + m[0].length
        this.nodes.push({ type: 'code', value: contents })
        return true
      }
    }
    this.pos = afterOpen
    this.text(ticks)
    return true
  }

  /** A2 math: "$$…$$" like a code span; a single "$" by Pandoc's rule. */
  private parseMath(): boolean {
    const s = this.subject
    const start = this.pos
    let n = 0
    while (s[start + n] === '$') n++
    if (n === 2) {
      // The next run of exactly two dollars closes it.
      for (let j = start + 2; j < s.length; j++) {
        if (s[j] !== '$') continue
        let k = 0
        while (s[j + k] === '$') k++
        if (k === 2) {
          let contents = s.slice(start + 2, j).replace(/\n/g, ' ')
          if (contents.length > 0 && /[^ ]/.test(contents) && contents[0] === ' ' && contents[contents.length - 1] === ' ')
            contents = contents.slice(1, -1)
          this.pos = j + 2
          this.nodes.push({ type: 'math', value: contents })
          return true
        }
        j += k - 1
      }
      this.pos = start + 2
      this.text('$$')
      return true
    }
    if (n > 2) {
      this.pos = start + n
      this.text('$'.repeat(n))
      return true
    }
    // Single "$": opens before a non-space; closes after a non-space, not before a digit.
    const next = s[start + 1]
    if (next !== undefined && !/\s/.test(next)) {
      for (let j = start + 1; j < s.length; j++) {
        if (s[j] !== '$' || s[j - 1] === '$' || s[j + 1] === '$') continue
        let bs = 0
        while (s[j - 1 - bs] === '\\') bs++
        if (bs % 2 === 1) continue
        if (/\s/.test(s[j - 1]) || /[0-9]/.test(s[j + 1] ?? '')) continue
        this.pos = j + 1
        this.nodes.push({ type: 'math', value: s.slice(start + 1, j) })
        return true
      }
    }
    this.pos = start + 1
    this.text('$')
    return true
  }

  private parseAutolink(): boolean {
    let m: string | null
    if ((m = this.match(reEmailAutolink))) {
      const dest = m.slice(1, -1)
      this.nodes.push({ type: 'link', href: normalizeUri('mailto:' + dest), title: '', children: [{ type: 'text', value: dest }] })
      return true
    }
    if ((m = this.match(reAutolink))) {
      const dest = m.slice(1, -1)
      this.nodes.push({ type: 'link', href: normalizeUri(dest), title: '', children: [{ type: 'text', value: dest }] })
      return true
    }
    return false
  }

  private parseHtmlTag(): boolean {
    const m = this.match(reHtmlTag)
    if (m === null) return false
    this.nodes.push({ type: 'html', value: m })
    return true
  }

  private parseEntity(): boolean {
    const m = this.match(reEntityHere)
    if (m === null) return false
    this.text(decodeEntity(m))
    return true
  }

  // ---- emphasis and strikethrough ------------------------------------------------

  private scanDelims(cc: string) {
    const start = this.pos
    let numdelims = 0
    while (this.subject[this.pos] === cc) {
      numdelims++
      this.pos++
    }
    if (numdelims === 0) return null
    const before = start === 0 ? '\n' : charBefore(this.subject, start)
    const after = this.pos >= this.subject.length ? '\n' : charAt(this.subject, this.pos)
    const afterWs = isUnicodeWhitespace(after)
    const afterPunct = isPunctuation(after)
    const beforeWs = isUnicodeWhitespace(before)
    const beforePunct = isPunctuation(before)
    const left = !afterWs && (!afterPunct || beforeWs || beforePunct)
    const right = !beforeWs && (!beforePunct || afterWs || afterPunct)
    let canOpen: boolean
    let canClose: boolean
    if (cc === '_') {
      canOpen = left && (!right || beforePunct)
      canClose = right && (!left || afterPunct)
    } else {
      canOpen = left
      canClose = right
    }
    this.pos = start
    return { numdelims, canOpen, canClose }
  }

  private handleDelim(cc: string): boolean {
    const res = this.scanDelims(cc)
    if (!res) return false
    const start = this.pos
    this.pos += res.numdelims
    const node = this.text(this.subject.slice(start, this.pos))
    // GFM strikethrough is one or two tildes; a longer run is just text.
    if (cc === '~' && res.numdelims > 2) return true
    if (res.canOpen || res.canClose) {
      this.delimiters = {
        cc,
        numdelims: res.numdelims,
        origdelims: res.numdelims,
        node,
        previous: this.delimiters,
        next: null,
        canOpen: res.canOpen,
        canClose: res.canClose,
      }
      if (this.delimiters.previous) this.delimiters.previous.next = this.delimiters
    }
    return true
  }

  private removeDelimiter(d: Delimiter) {
    if (d.previous) d.previous.next = d.next
    if (d.next) d.next.previous = d.previous
    else this.delimiters = d.previous
  }

  private processEmphasis(stackBottom: Delimiter | null) {
    const openersBottom = new Map<string, Delimiter | null>()
    let closer = this.delimiters
    while (closer !== null && closer.previous !== stackBottom) closer = closer.previous
    while (closer !== null) {
      const cc = closer.cc
      if (!closer.canClose) {
        closer = closer.next
        continue
      }
      const key = `${cc}${closer.canOpen ? 1 : 0}${closer.origdelims % 3}`
      let opener = closer.previous
      let found = false
      while (opener !== null && opener !== stackBottom && opener !== openersBottom.get(key)) {
        const oddMatch =
          (closer.canOpen || opener.canClose) && closer.origdelims % 3 !== 0 && (opener.origdelims + closer.origdelims) % 3 === 0
        if (opener.cc === cc && opener.canOpen) {
          if (cc === '~' ? opener.numdelims === closer.numdelims : !oddMatch) {
            found = true
            break
          }
        }
        opener = opener.previous
      }
      const oldCloser = closer
      if (found && opener) {
        const use = cc === '~' ? closer.numdelims : closer.numdelims >= 2 && opener.numdelims >= 2 ? 2 : 1
        opener.numdelims -= use
        closer.numdelims -= use
        opener.node.value = opener.node.value!.slice(0, opener.node.value!.length - use)
        closer.node.value = closer.node.value!.slice(0, closer.node.value!.length - use)
        const from = this.nodes.indexOf(opener.node)
        const to = this.nodes.indexOf(closer.node)
        const inner = this.nodes.splice(from + 1, to - from - 1)
        const wrap: Node = { type: cc === '~' ? 'del' : use === 1 ? 'emph' : 'strong', children: inner }
        this.nodes.splice(from + 1, 0, wrap)
        // Delimiters between opener and closer are used up.
        if (opener.next !== closer) {
          opener.next = closer
          closer.previous = opener
        }
        if (opener.numdelims === 0) {
          this.nodes.splice(this.nodes.indexOf(opener.node), 1)
          this.removeDelimiter(opener)
        }
        if (closer.numdelims === 0) {
          this.nodes.splice(this.nodes.indexOf(closer.node), 1)
          const next = closer.next
          this.removeDelimiter(closer)
          closer = next
        }
      } else {
        closer = closer.next
        openersBottom.set(key, oldCloser.previous)
        if (!oldCloser.canOpen) this.removeDelimiter(oldCloser)
      }
    }
    while (this.delimiters !== null && this.delimiters !== stackBottom) this.removeDelimiter(this.delimiters)
  }

  // ---- links and images -----------------------------------------------------------

  private addBracket(node: Node, index: number, image: boolean) {
    if (this.brackets !== null) this.brackets.bracketAfter = true
    this.brackets = {
      node,
      previous: this.brackets,
      previousDelimiter: this.delimiters,
      index,
      image,
      active: true,
      bracketAfter: false,
    }
  }

  private removeBracket() {
    if (this.brackets) this.brackets = this.brackets.previous
  }

  private parseOpenBracket(): boolean {
    const start = this.pos
    this.pos++
    this.addBracket(this.text('['), start, false)
    return true
  }

  private parseBang(): boolean {
    const start = this.pos
    this.pos++
    if (this.peek() === '[') {
      this.pos++
      this.addBracket(this.text('!['), start + 1, true)
    } else this.text('!')
    return true
  }

  private parseLinkLabel(): number {
    const m = this.match(reLinkLabel)
    if (m === null || m.length > 1001) return 0
    return m.length
  }

  private parseLinkTitle(): string | null {
    const title = this.match(reLinkTitle)
    return title === null ? null : unescapeString(title.slice(1, -1))
  }

  private parseLinkDestination(): string | null {
    let res = this.match(reLinkDestinationBraces)
    if (res !== null) return normalizeUri(unescapeString(res.slice(1, -1)))
    if (this.peek() === '<') return null // an unclosed <…> destination
    const savepos = this.pos
    let openparens = 0
    let c: string | undefined
    while ((c = this.peek()) !== undefined) {
      if (c === '\\' && reEscapable.test(this.subject[this.pos + 1] ?? '')) this.pos += 2
      else if (c === '(') {
        this.pos++
        openparens++
      } else if (c === ')') {
        if (openparens < 1) break
        this.pos++
        openparens--
      } else if (/[ \t\n\x0b\x0c\r\x00-\x1f]/.test(c)) break // ASCII whitespace or a control character
      else this.pos++
    }
    if (this.pos === savepos && c !== ')') return null
    if (openparens !== 0) return null
    res = this.subject.slice(savepos, this.pos)
    return normalizeUri(unescapeString(res))
  }

  private parseCloseBracket(): boolean {
    this.pos++
    const startpos = this.pos
    const opener = this.brackets
    if (opener === null) {
      this.text(']')
      return true
    }
    if (!opener.active) {
      this.text(']')
      this.removeBracket()
      return true
    }
    const isImage = opener.image
    const savepos = this.pos
    let dest: string | null = null
    let title = ''
    let matched = false

    if (this.peek() === '(') {
      this.pos++
      if (this.spnl() && (dest = this.parseLinkDestination()) !== null && this.spnl()) {
        const ws = /\s/.test(this.subject[this.pos - 1] ?? '')
        const t = ws ? this.parseLinkTitle() : null
        if (t !== null) title = t
        if (this.spnl() && this.peek() === ')') {
          this.pos++
          matched = true
        }
      }
      if (!matched) this.pos = savepos
    }

    if (!matched) {
      const beforelabel = this.pos
      const n = this.parseLinkLabel()
      let reflabel = ''
      if (n > 2) reflabel = this.subject.slice(beforelabel, beforelabel + n)
      else if (!opener.bracketAfter) reflabel = this.subject.slice(opener.index, startpos)
      if (n === 0) this.pos = savepos
      if (reflabel) {
        const link = this.refmap.get(normalizeLabel(reflabel.slice(1, -1)))
        if (link) {
          dest = link.href
          title = link.title
          matched = true
        }
      }
    }

    if (matched && dest !== null) {
      const from = this.nodes.indexOf(opener.node)
      const inner = this.nodes.splice(from + 1)
      this.nodes.splice(from, 1)
      // Emphasis inside the link text is resolved first, within the link.
      const outer = this.nodes
      this.nodes = inner
      this.processEmphasis(opener.previousDelimiter)
      const children = this.nodes
      this.nodes = outer
      this.nodes.push(isImage ? { type: 'image', href: dest, title, children } : { type: 'link', href: dest, title, children })
      this.removeBracket()
      // No links inside links: earlier "[" openers can no longer make a link.
      if (!isImage) {
        let b = this.brackets
        while (b !== null) {
          if (!b.image) b.active = false
          b = b.previous
        }
      }
      return true
    }
    this.removeBracket()
    this.pos = startpos
    this.text(']')
    return true
  }
}

// processEmphasis splices nodes inside `this.nodes`, but a link's delimiters
// were all inside its text, so they are resolved while `this.nodes` is that text.

function charAt(s: string, i: number): string {
  const cp = s.codePointAt(i)!
  return String.fromCodePoint(cp)
}

function charBefore(s: string, i: number): string {
  const lo = s.charCodeAt(i - 1)
  if (lo >= 0xdc00 && lo <= 0xdfff && i >= 2) return s.slice(i - 2, i)
  return s[i - 1]
}

function mergeText(nodes: Node[]): Node[] {
  const out: Node[] = []
  for (const n of nodes) {
    if (n.children) n.children = mergeText(n.children)
    const last = out[out.length - 1]
    if (n.type === 'text' && last && last.type === 'text' && !n.escaped && !last.escaped) last.value += n.value!
    else if (!(n.type === 'text' && n.value === '')) out.push(n)
  }
  return out
}

// ---- GFM autolink literals (www., http(s)://, email) ---------------------------------

const reWwwOrUrl = /(?:www\.|https?:\/\/)[^\s<]*/gi
const reEmail = /[A-Za-z0-9.+_-]+@[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+/g

/** Trim what GFM says isn't part of an autolink: trailing punctuation, an unmatched ")", an entity. */
function trimAutolink(url: string): string {
  for (;;) {
    const before = url
    url = url.replace(/[?!.,:*_~'"]+$/, '')
    if (url.endsWith(')')) {
      const open = (url.match(/\(/g) ?? []).length
      const close = (url.match(/\)/g) ?? []).length
      if (close > open) url = url.slice(0, -1)
    }
    url = url.replace(/&[A-Za-z0-9]+;$/, '')
    if (url === before) return url
  }
}

function validDomain(host: string): boolean {
  const parts = host.split('.')
  if (parts.some((p) => p === '' || !/^[A-Za-z0-9_-]+$/.test(p))) return false
  // No underscores in the last two segments.
  return !parts.slice(-2).some((p) => p.includes('_'))
}

function linkifyText(text: string): Node[] {
  const found: { start: number; end: number; href: string; label: string }[] = []
  let m: RegExpExecArray | null
  reWwwOrUrl.lastIndex = 0
  while ((m = reWwwOrUrl.exec(text)) !== null) {
    const prev = text[m.index - 1]
    const isWwwStart = /^www\./i.test(m[0])
    // www. after a space, a line start or one of ( * _ [ ] ~; a scheme after anything but a letter.
    if (prev !== undefined && (isWwwStart ? !/[\s*_~()[\]]/.test(prev) : /[A-Za-z]/.test(prev))) continue
    const label = trimAutolink(m[0])
    const isWww = /^www\./i.test(label)
    const host = (isWww ? label : label.replace(/^https?:\/\//i, '')).split(/[/?#]/)[0]
    if (!host || !validDomain(host) || (!isWww && !host.includes('.') && !/^localhost$/i.test(host))) continue
    if (isWww && host.length <= 4) continue
    found.push({ start: m.index, end: m.index + label.length, href: normalizeUri(isWww ? `http://${label}` : label), label })
    reWwwOrUrl.lastIndex = m.index + label.length
  }
  reEmail.lastIndex = 0
  while ((m = reEmail.exec(text)) !== null) {
    const prev = text[m.index - 1]
    if (prev !== undefined && /[A-Za-z0-9.+_\-/@]/.test(prev)) continue
    let label = m[0]
    while (label.endsWith('.')) label = label.slice(0, -1)
    if (/[-_]$/.test(label)) continue
    const s = m.index
    if (found.some((f) => s < f.end && s + label.length > f.start)) continue
    found.push({ start: s, end: s + label.length, href: normalizeUri(`mailto:${label}`), label })
  }
  if (!found.length) return [{ type: 'text', value: text }]
  found.sort((a, b) => a.start - b.start)
  const out: Node[] = []
  let at = 0
  for (const f of found) {
    if (f.start < at) continue
    if (f.start > at) out.push({ type: 'text', value: text.slice(at, f.start) })
    out.push({ type: 'link', href: f.href, title: '', children: [{ type: 'text', value: f.label }] })
    at = f.end
  }
  if (at < text.length) out.push({ type: 'text', value: text.slice(at) })
  return out
}

function autolinkLiterals(nodes: Node[], inLink = false): Node[] {
  const out: Node[] = []
  for (const n of nodes) {
    if (n.type === 'text' && !inLink && !n.escaped) out.push(...linkifyText(n.value!))
    else {
      if (n.children) n.children = autolinkLiterals(n.children, inLink || n.type === 'link' || n.type === 'image')
      out.push(n)
    }
  }
  return out
}

function finish(nodes: Node[]): Inline[] {
  return nodes.map((n): Inline => {
    switch (n.type) {
      case 'text':
      case 'code':
      case 'math':
      case 'html':
        return { type: n.type, value: n.value! }
      case 'softbreak':
      case 'hardbreak':
        return { type: n.type }
      case 'emph':
      case 'strong':
      case 'del':
        return { type: n.type, children: finish(n.children!) }
      case 'link':
        return { type: 'link', href: n.href!, title: n.title!, children: finish(n.children!) }
      case 'image':
        return { type: 'image', src: n.href!, title: n.title!, children: finish(n.children!) }
    }
  })
}
