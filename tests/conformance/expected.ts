// What a case SHOULD render as, decided programmatically:
//
//   expected = additions( outline( reference( sourceRules(markdown) ) ) )
//
// The reference is micromark with its GFM and math extensions — a renderer that
// passes the whole CommonMark and GFM test suites, i.e. what GitHub does. Our
// rules (tests/conformance/RULES.md) are applied around it, each in one place:
//
//   A1 Mermaid   ```mermaid (exactly, lowercase) is a diagram.            outline
//   A2 Math      $…$, $$…$$ and ```math are math, where:                   outline
//      D1          a single $ follows Pandoc's rule: it opens only before a
//                  non-space, closes only after a non-space and not before a
//                  digit — so "$5 and $10" stays text;                       source
//      D2          a paragraph that is just "$$ x $$" is display math.       source
//   A3 Labels    "- {1.1} Goals" → li label=1.1, text "Goals".             outline
//   A5 Alerts    a top-level quote whose first line is exactly "> [!NOTE]"
//                (TIP, IMPORTANT, WARNING, CAUTION; any case) is an alert.   source + outline
//
// "source" rules rewrite the input before the reference sees it (escaping a $
// that isn't a delimiter, putting $$ on its own lines, marking an alert);
// "outline" rules rewrite the reference's outline. A4 (numbered todos keep
// their number) is display only: the structure is standard, so no rule.

import { micromark, parse, postprocess, preprocess } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'
import { math, mathHtml } from 'micromark-extension-math'
import { outline } from './outline'

/** The reference rendering: CommonMark + GFM + math, as GitHub renders it. */
export function referenceHtml(md: string, extensions = true): string {
  return micromark(md, {
    // As the spec does: keep raw HTML and any link protocol (the app sanitises afterwards).
    allowDangerousHtml: true,
    allowDangerousProtocol: true,
    extensions: extensions ? [gfm(), math()] : [],
    htmlExtensions: extensions ? [gfmHtml(), mathHtml({ throwOnError: false })] : [],
  })
}

const indentOf = (l: string) => l.length - l.trimStart().length

// ---- source rules (D1, D2, A5) ------------------------------------------------

interface Span {
  type: string
  start: number
  end: number
  /** How many quotes / lists enclose it. */
  depth: number
}

/** The block and inline spans of a document, as the reference parses it (no math). */
function spans(md: string): Span[] {
  const events = postprocess(parse({ extensions: [gfm()] }).document().write(preprocess()(md, undefined, true)))
  const out: Span[] = []
  let depth = 0
  const nesting = new Set(['blockQuote', 'listOrdered', 'listUnordered'])
  for (const [kind, tok] of events) {
    if (kind === 'enter') {
      out.push({ type: tok.type, start: tok.start.offset, end: tok.end.offset, depth })
      if (nesting.has(tok.type)) depth++
    } else if (nesting.has(tok.type)) depth--
  }
  return out
}

const ALERT_LINE = /^>[ \t]?\[!(note|tip|important|warning|caution)\][ \t]*$/i
export const ALERT_MARK = 'ALERTMARK-'

/** Rewrite the input so the reference renders our math and alert rules. */
export function sourceRules(md: string): string {
  const all = spans(md)
  const edits: { at: number; end: number; text: string }[] = []
  const isProtected = (i: number) =>
    all.some((s) => /^(codeText|autolink|htmlText|literalAutolink)/.test(s.type) && s.start <= i && i < s.end)
  const escaped = (i: number) => {
    let n = 0
    while (i - 1 - n >= 0 && md[i - 1 - n] === '\\') n++
    return n % 2 === 1
  }

  for (const r of all) {
    if (!/^(paragraph|tableContent|atxHeadingText|setextHeadingText)$/.test(r.type)) continue
    const text = md.slice(r.start, r.end)

    // D2: a paragraph that is only "$$ tex $$" becomes a display block.
    const one = r.type === 'paragraph' ? /^\$\$\s*([^\n$]*\S[^\n$]*?)\s*\$\$$/.exec(text) : null
    if (one) {
      const lineStart = md.lastIndexOf('\n', r.start - 1) + 1
      const pad = md.slice(lineStart, r.start).replace(/[^>\s]/g, ' ')
      edits.push({ at: r.start, end: r.end, text: `$$\n${pad}${one[1]}\n${pad}$$` })
      continue
    }

    // D1: single-dollar delimiters by Pandoc's rule; any other $ is escaped.
    const dollars: number[] = []
    for (let i = r.start; i < r.end; i++)
      if (md[i] === '$' && md[i - 1] !== '$' && md[i + 1] !== '$' && !escaped(i) && !isProtected(i)) dollars.push(i)
    const space = (c: string | undefined) => c === undefined || /\s/.test(c)
    for (let k = 0; k < dollars.length; k++) {
      const open = dollars[k]
      let close = -1
      if (!space(md[open + 1]) && open + 1 < r.end)
        for (let m = k + 1; m < dollars.length; m++) {
          const q = dollars[m]
          if (!space(md[q - 1]) && !/[0-9]/.test(md[q + 1] ?? '')) {
            close = m
            break
          }
        }
      if (close < 0) {
        edits.push({ at: open, end: open, text: '\\' })
        continue
      }
      k = close
    }
  }

  // A5: an alert marker alone on the first line of a top-level quote.
  for (const q of all) {
    if (q.type !== 'blockQuote' || q.depth !== 0) continue
    const eol = md.indexOf('\n', q.start)
    const line = md.slice(q.start, eol < 0 ? md.length : eol)
    const m = ALERT_LINE.exec(line)
    if (m) edits.push({ at: q.start, end: q.start + line.length, text: `> ${ALERT_MARK}${m[1].toLowerCase()}\n>` })
  }

  let out = md
  for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.text + out.slice(e.end)
  return out
}

/** Apply our additions (above) to a reference outline. */
export function applyAdditions(lines: string[]): string[] {
  const out: string[] = []
  const lists: { indent: number; kind: string }[] = [] // open ul/ol by indent
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ind = indentOf(line)
    const body = line.trimStart()
    const pad = line.slice(0, ind)
    while (lists.length && lists[lists.length - 1].indent >= ind) lists.pop()
    if (body === 'ul' || body.startsWith('ol')) lists.push({ indent: ind, kind: body.slice(0, 2) })

    // 1. Mermaid code → diagram.
    if (body === 'code lang=mermaid') {
      out.push(`${pad}diagram mermaid`)
      continue
    }
    // 2. ```math → display math.
    if (body === 'code lang=math') {
      const tex: string[] = []
      while (i + 1 < lines.length && lines[i + 1].trimStart().startsWith('| ') && indentOf(lines[i + 1]) > ind)
        tex.push(lines[++i].trimStart().slice(2))
      out.push(`${pad}math-block: ${tex.join(' ').replace(/\s+/g, ' ').trim()}`)
      continue
    }
    // GFM: in a table cell, "\|" is a pipe in every inline span — math too (the
    // reference leaves it escaped inside math).
    if (/^(th|td): /.test(body) && body.includes('\\|')) {
      out.push(line.replace(/\$[^$]*\$/g, (m) => m.replace(/\\\|/g, '|')))
      continue
    }
    // A5. A quote opened by an alert marker → alert.
    if (body === 'quote') {
      const next = lines[i + 1] ?? ''
      const m = new RegExp(`^\\s*p: ${ALERT_MARK}(\\w+)$`).exec(next)
      if (m && indentOf(next) === ind + 2) {
        out.push(`${pad}alert ${m[1]}`)
        i++
        continue
      }
    }
    // 3. {label} at the start of a bullet item.
    const parent = lists[lists.length - 1]
    if (body.startsWith('li') && parent?.kind === 'ul' && parent.indent === ind - 2) {
      const next = lines[i + 1] ?? ''
      const m = /^(\s*)(text|p): \{([^{}\s][^{}]*)\} (.*)$/.exec(next)
      if (m && indentOf(next) === ind + 2) {
        out.push(`${line} label=${m[3]}`)
        out.push(`${m[1]}${m[2]}: ${m[4]}`)
        i++
        continue
      }
    }
    out.push(line)
  }
  return out
}

/** The expected outline for a piece of markdown. */
export function expectedOutline(md: string): string {
  return applyAdditions(outline(referenceHtml(sourceRules(md))).split('\n')).join('\n')
}
