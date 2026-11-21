// The finished PDF, read back as data. All fixture cases are typeset into one
// real PDF by pdfmake (as the app does, with its DejaVu fonts), then:
//
//   • pdf.js reads every piece of text with its page and position:
//       – every character the plan holds is in the PDF, in the same order;
//       – no text crosses the page margins;
//     and every link annotation, which must match the plan's links;
//   • pdfmake's own layout (where it placed each node) gives:
//       – nested list items start further right than their parent, and
//         sibling items line up;
//       – a heading is always on the same page as what follows it.
//
// No screenshots: these are positions and text, compared as data.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pdfmake from 'pdfmake'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { fixtureCases } from './cases'
import { parse } from '../../src/lib/md'
import { buildDocument, PAGE, type Content } from '../../src/lib/pdf/markdownToPdf'

type N = Record<string, unknown>
const isNode = (c: unknown): c is N => !!c && typeof c === 'object' && !Array.isArray(c)

const FONTS = join(__dirname, '../../public/fonts/')
const face = (n: string, b: string, i: string, bi: string) => ({ normal: FONTS + n, bold: FONTS + b, italics: FONTS + i, bolditalics: FONTS + bi })

// ---- the plan: what the PDF should contain ---------------------------------------

interface Placed {
  page: number
  left: number
  top: number
}

const cases = fixtureCases(readFileSync(join(__dirname, 'fixture.md'), 'utf8'))
let seq = 0
const items: { id: string; parent: string | null; list: string; at: string }[] = []
let currentCase = ''
const headings: { id: string; next: string | null; text: string }[] = []
const links = new Set<string>()
let expectedText = ''
/** Each table's header text: pdfmake repeats it at the top of every page the table runs onto. */
const tableHeads: string[] = []

/** An item's first content block (a paragraph, code panel …), past its box or label column. */
function firstBlock(n: N): N | null {
  for (const key of ['columns', 'stack']) {
    for (const c of (n[key] as Content[] | undefined) ?? []) {
      if (!isNode(c) || c.ml === 'lead') continue
      if (c.ml === 'list') return null // the item starts with a nested list: no text of its own
      if (c.ml && c.ml !== 'item') return c
      const inner = firstBlock(c)
      if (inner) return inner
    }
  }
  return null
}

/** Collect the plan's text in drawing order, and tag items and headings with ids. */
function collect(c: Content, parentItem: string | null) {
  if (Array.isArray(c)) {
    c.forEach((x) => collect(x, parentItem))
    return
  }
  if (typeof c === 'string') {
    expectedText += c
    return
  }
  if (!isNode(c)) return
  if (c.ml === 'list') {
    const list = `list-${seq++}`
    for (const item of (c.ol ?? c.ul ?? c.stack) as N[]) {
      const id = `item-${seq++}`
      // Tag where the item's text starts: its first block (beside any box or label).
      const textAt = firstBlock(item)
      if (textAt) {
        // (pdfmake passes a node's id to the layout hook, not its other keys: the kind rides along.)
        textAt.id = `${id}:${textAt.ml}`
        items.push({ id, parent: parentItem, list, at: `${currentCase} "${JSON.stringify(textAt.text ?? textAt.ml).replace(/[^A-Za-z0-9 ]+/g, ' ').trim().slice(0, 30)}"` })
      }
      collect(item, id)
    }
    return
  }
  if (typeof c.link === 'string') links.add(c.link)
  if (typeof c.text === 'string') expectedText += c.text
  else if (c.text !== undefined) collect(c.text as Content, parentItem)
  if (c.table) {
    const body = (c.table as N).body as Content[][]
    if (c.ml === 'table') {
      const before = expectedText
      for (const cell of body[0]) collect(cell, parentItem)
      tableHeads.push(squash(expectedText.slice(before.length)))
      for (const row of body.slice(1)) for (const cell of row) collect(cell, parentItem)
    } else for (const row of body) for (const cell of row) collect(cell, parentItem)
  }
  for (const k of ['stack', 'columns']) if (c[k]) collect(c[k] as Content, parentItem)
}

/** Headings and the block after each, across the whole document (top level). */
function pairHeadings(content: Content[]) {
  const flat = content.flatMap((c) => (Array.isArray(c) ? c : [c])).filter(isNode)
  flat.forEach((n, i) => {
    if (n.ml !== 'heading') return
    n.id = `h-${seq++}`
    let j = i + 1
    while (flat[j] && flat[j].ml === 'rule') j++
    const next = flat[j]
    if (next) next.id ??= `n-${seq++}`
    const text = JSON.stringify(n.text).replace(/[^A-Za-z0-9 .-]+/g, ' ').trim().slice(0, 50)
    headings.push({ id: n.id as string, next: next ? (next.id as string) : null, text })
  })
}

// ---- build, typeset and read back -------------------------------------------------

const placed = new Map<string, Placed>()
let pdfText = ''
const pdfLinks = new Set<string>()
const outside: string[] = []

beforeAll(async () => {
  const content: Content[] = []
  for (const c of cases) {
    const plan = (buildDocument(parse(c.input), c.id, { math: new Map(), images: new Map(), inlineMath: (s) => s }) as { content: Content[] }).content
    content.push(...plan)
    currentCase = c.id
    collect(plan, null)
  }
  const doc = buildDocument(parse(''), 'fixture', { math: new Map(), images: new Map(), inlineMath: (s) => s }) as N
  doc.content = content
  pairHeadings(content)

  // Record where pdfmake placed every tagged node (its final layout).
  const keep = doc.pageBreakBefore as (n: N, q: unknown) => boolean
  doc.pageBreakBefore = (n: N, q: unknown) => {
    const pos = n.startPosition as { pageNumber: number; left: number; top: number } | undefined
    // pdfmake reports a panel (code, quote, table) at its first cell's text; the
    // panel itself starts its border and padding further left.
    const [id, kind] = typeof n.id === 'string' ? n.id.split(':') : []
    const inset = ({ code: 10.6, diagram: 10.6, quote: 12.5, alert: 12.5, table: 6.6 } as Record<string, number>)[kind] ?? 0
    const moved = keep(n, q)
    // pdfmake reports each node once; when the rule moves a heading to the next
    // page it isn't reported again, so record where the move puts it.
    if (id && pos) placed.set(id, { page: pos.pageNumber + (moved ? 1 : 0), left: pos.left - inset, top: pos.top })
    return moved
  }

  pdfmake.setFonts({
    Sans: face('DejaVuSans.woff', 'DejaVuSans-Bold.woff', 'DejaVuSans-Oblique.woff', 'DejaVuSans-BoldOblique.woff'),
    Mono: face('DejaVuSansMono.woff', 'DejaVuSansMono-Bold.woff', 'DejaVuSansMono.woff', 'DejaVuSansMono-Bold.woff'),
  })
  pdfmake.setUrlAccessPolicy(() => false)
  const buf: Uint8Array = await pdfmake.createPdf(doc).getBuffer()

  const pdf = await getDocument({ data: new Uint8Array(buf) }).promise
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const [, , w, h] = page.view
    for (const it of (await page.getTextContent()).items as { str: string; transform: number[]; width: number }[]) {
      const x = it.transform[4]
      const y = it.transform[5]
      if (y < PAGE.margins[3] - 4) continue // the page-number footer
      if (/^\d{1,9}[.)]$/.test(it.str.trim())) continue // ordered-list markers (pdfmake draws them; not in the plan's text)
      pdfText += it.str
      if (it.str.trim() && (x < PAGE.margins[0] - 1 || x + it.width > w - PAGE.margins[2] + 1 || y > h - PAGE.margins[1] + 2))
        outside.push(`page ${p}: "${it.str.slice(0, 40)}" x=${x.toFixed(1)}…${(x + it.width).toFixed(1)}`)
    }
    for (const a of (await page.getAnnotations()) as { subtype: string; url?: string; unsafeUrl?: string }[])
      if (a.subtype === 'Link') pdfLinks.add(a.unsafeUrl ?? a.url ?? '')
  }
}, 120_000)

const squash = (s: string) => s.replace(/[\s\u200B]+/g, '')

describe('the finished PDF', () => {
  it('contains every character of the plan, in order', () => {
    // pdfmake draws a table's header row after its body (to repeat it on later
    // pages), so headers are checked on their own and taken out of the stream.
    let want = squash(expectedText)
    let got = squash(pdfText)
    for (const h of new Set(tableHeads.filter(Boolean))) {
      const tables = tableHeads.filter((x) => x === h).length
      expect(got.split(h).length - 1, `table header "${h}" drawn at least once per table`).toBeGreaterThanOrEqual(tables)
      want = want.split(h).join('')
      got = got.split(h).join('')
    }
    let i = 0
    while (i < want.length && want[i] === got[i]) i++
    expect(got.slice(i, i + 80), `first difference after: …${want.slice(Math.max(0, i - 60), i)}`).toBe(want.slice(i, i + 80))
    expect(got.length).toBeGreaterThan(10_000)
  })

  it('keeps all text inside the page margins', () => {
    expect(outside).toEqual([])
  })

  it('has a working link for every link in the document', () => {
    expect([...pdfLinks].sort()).toEqual([...links].sort())
  })

  it('indents each nested list further than its parent, and lines up siblings', () => {
    const bad: string[] = []
    const byList = new Map<string, number[]>()
    for (const it of items) {
      const pos = placed.get(it.id)
      if (!pos) continue
      byList.set(it.list, [...(byList.get(it.list) ?? []), pos.left])
      const parent = it.parent ? placed.get(it.parent) : undefined
      if (parent && !(pos.left > parent.left + 4)) bad.push(`${it.at}: starts at ${pos.left.toFixed(1)}, not right of its parent (${parent.left.toFixed(1)})`)
    }
    for (const [list, lefts] of byList)
      if (Math.max(...lefts) - Math.min(...lefts) > 0.5) bad.push(`${items.find((x) => x.list === list)!.at}…: siblings start at ${lefts.map((l) => l.toFixed(1))}`)
    expect(items.length).toBeGreaterThan(300)
    expect(bad).toEqual([])
  })

  it('never leaves a heading at the bottom of a page, apart from what follows it', () => {
    const bad = headings
      .filter((h) => h.next && placed.get(h.id) && placed.get(h.next))
      .filter((h) => placed.get(h.id)!.page !== placed.get(h.next!)!.page)
      .map((h) => `"${h.text}" on page ${placed.get(h.id)!.page}, what follows on ${placed.get(h.next!)!.page}`)
    expect(headings.length).toBeGreaterThan(40)
    expect(bad).toEqual([])
  })
})
