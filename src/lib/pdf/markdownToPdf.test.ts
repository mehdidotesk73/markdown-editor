import { describe, it, expect } from 'vitest'
import { lexMarkdown } from '../markdownParser'
import { breakLongTokens, buildDocument, isDisplayInline, type Content, type PdfAssets, type RenderedMath } from './markdownToPdf'
import { texToUnicode } from './inlineMath'
import { texToSvg } from './math'

// Plain-object view of the content tree, for poking at.
type Node = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const FAKE_SVG: RenderedMath = { svg: '<svg/>', width: 100, height: 20 }

function assets(over: Partial<PdfAssets> = {}): PdfAssets {
  return {
    math: new Map(),
    images: new Map(),
    inlineMath: (tex) => `«${tex}»`,
    decode: (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    ...over,
  }
}

function content(md: string, a: PdfAssets = assets()): Content[] {
  return (buildDocument(lexMarkdown(md), 'Doc', a) as Node).content as Content[]
}

/** Flatten nested arrays so tests can find nodes regardless of grouping. */
function flat(c: Content[]): Node[] {
  return c.flatMap((x) => (Array.isArray(x) ? flat(x) : [x as Node]))
}

/** All text of a run list, concatenated. */
function textOf(runs: unknown): string {
  if (typeof runs === 'string') return runs
  if (Array.isArray(runs)) return runs.map(textOf).join('')
  if (runs && typeof runs === 'object' && 'text' in runs) return textOf((runs as Node).text)
  return ''
}

describe('PDF layout rules', () => {
  it('sets title, A4 and the body fonts', () => {
    const doc = buildDocument(lexMarkdown('Hi'), 'My notes', assets()) as Node
    expect(doc.info.title).toBe('My notes')
    expect(doc.pageSize).toBe('A4')
    expect(doc.defaultStyle.font).toBe('Sans')
  })

  it('h1/h2 get a rule beneath; deeper headings do not', () => {
    const [h1, h3] = content('# Title\n\n### Sub')
    expect(Array.isArray(h1)).toBe(true)
    const [head, rule] = h1 as Node[]
    expect(head).toMatchObject({ style: 'h1', headlineLevel: 1 })
    expect(rule.canvas).toBeDefined()
    expect(h3).toMatchObject({ style: 'h3', headlineLevel: 3 })
  })

  it('keeps a heading off the bottom of a page only when content follows on the next', () => {
    const doc = buildDocument(lexMarkdown('# A'), 'x', assets()) as Node
    const q = (following: Node[], next: Node[]) => ({ getFollowingNodesOnPage: () => following, getNodesOnNextPage: () => next })
    expect(doc.pageBreakBefore({ headlineLevel: 2 }, q([], [{ text: 'body' }]))).toBe(true)
    expect(doc.pageBreakBefore({ headlineLevel: 2 }, q([{ canvas: [] }], [{ text: 'body' }]))).toBe(true) // only its own rule follows
    expect(doc.pageBreakBefore({ headlineLevel: 2 }, q([{ text: 'body' }], []))).toBe(false)
    expect(doc.pageBreakBefore({ headlineLevel: 2 }, q([], []))).toBe(false) // last thing in the document
    expect(doc.pageBreakBefore({ text: 'p' }, q([], [{ text: 'x' }]))).toBe(false)
  })

  it('maps inline formatting to runs', () => {
    const [p] = content('Some **bold**, *it*, ~~gone~~, `code` and [link](https://e.x).') as Node[]
    const runs = p.text as Node[]
    expect(runs.find((r) => r.text === 'bold')).toMatchObject({ bold: true })
    expect(runs.find((r) => r.text === 'it')).toMatchObject({ italics: true })
    expect(runs.find((r) => r.text === 'gone')).toMatchObject({ decoration: 'lineThrough' })
    expect(runs.find((r) => r.text === 'code')).toMatchObject({ font: 'Mono' })
    expect(runs.find((r) => r.text === 'link')).toMatchObject({ link: 'https://e.x' })
  })

  it('decodes HTML entities in text', () => {
    expect(textOf(content('Tom & "Jerry"')[0])).toBe('Tom & "Jerry"')
  })

  it('builds nested and numbered lists', () => {
    const [ul] = content('- a\n- b\n  - c') as Node[]
    expect(ul.ul).toHaveLength(2)
    const nested = flat(ul.ul[1].stack).find((n) => n.ul)
    expect(nested?.ul).toHaveLength(1)
    const [ol] = content('3. three\n4. four') as Node[]
    expect(ol.ol).toHaveLength(2)
    expect(ol.start).toBe(3)
  })

  it('draws a checklist with its own boxes and no bullets', () => {
    const [list] = content('- [x] done\n- [ ] open') as Node[]
    expect(list.ul).toBeUndefined()
    expect(list.stack.map((i: Node) => i.columns[0].text)).toEqual(['☑', '☐'])
    expect(textOf(list.stack[0].columns[1].stack)).toBe('done')
  })

  it('keeps code blocks verbatim in the mono style, on a tinted panel', () => {
    const [code] = content('```\nif (a) {\n    b()\n}\n```') as Node[]
    const cell = code.table.body[0][0]
    expect(cell.style).toBe('code')
    expect(cell.text).toBe('if (a) {\n    b()\n}')
    expect(code.layout.fillColor()).toBe('#fffbf4')
  })

  it('lets long code blocks split across pages (no unbreakable)', () => {
    const [code] = content('```\n' + Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n') + '\n```') as Node[]
    expect(code.unbreakable).toBeUndefined()
    expect(code.table.body[0][0].text.split('\n')).toHaveLength(80)
  })

  it('splits only tokens longer than a whole line; ordinary lines are left to wrap at spaces', () => {
    expect(breakLongTokens('short words here', 10)).toBe('short words here')
    expect(breakLongTokens('a ' + 'x'.repeat(25) + ' b', 10)).toBe('a ' + 'x'.repeat(10) + '\n' + 'x'.repeat(10) + '\n' + 'x'.repeat(5) + ' b')
    const long = 'word '.repeat(60)
    const [code] = content('```\n' + long + '\n' + 'h'.repeat(200) + '\n```') as Node[]
    const lines = code.table.body[0][0].text.split('\n')
    expect(lines[0]).toBe(long.replace(/\t/g, '    ')) // a long line with spaces is untouched
    expect(lines.length).toBeGreaterThan(2) // the 200-char token is split
  })

  it('builds tables with a header row and column alignment', () => {
    const [t] = content('| A | B |\n|:-|-:|\n| 1 | 2 |\n| 3 | 4 |') as Node[]
    expect(t.table.headerRows).toBe(1)
    expect(t.table.body).toHaveLength(3)
    expect(t.table.body[0][0]).toMatchObject({ bold: true, alignment: 'left' })
    expect(t.table.body[1][1]).toMatchObject({ alignment: 'right' })
    expect(textOf(t.table.body[2][1].text)).toBe('4')
  })

  it('renders blockquotes with their content', () => {
    const [q] = content('> quoted **text**') as Node[]
    expect(textOf(q.table.body[0][0].stack)).toBe('quoted text')
  })

  it('embeds loaded images and falls back to alt text otherwise', () => {
    const md = '![cat](https://img/cat.png)'
    const missing = content(md)[0] as Node
    expect(textOf(missing)).toBe('[image: cat]')
    const loaded = content(md, assets({ images: new Map([['https://img/cat.png', { dataUrl: 'data:x', width: 2000, height: 100 }]]) }))[0] as Node
    expect(loaded.image).toBe('data:x')
    expect(loaded.width).toBeLessThanOrEqual(500) // fits the column, never upscales
  })
})

describe('Math handling', () => {
  it('one-line $$…$$ becomes a typeset block, splitting the paragraph around it', () => {
    const tokens = lexMarkdown('Before $$ E=mc^2 $$ after')
    expect((tokens[0] as Node).tokens.some(isDisplayInline)).toBe(true)
    const parts = flat(content('Before $$ E=mc^2 $$ after', assets({ math: new Map([['E=mc^2', FAKE_SVG]]) })))
    expect(parts.map((p) => (p.svg ? 'SVG' : textOf(p).trim()))).toEqual(['Before', 'SVG', 'after'])
  })

  it('multi-line $$ blocks become typeset blocks', () => {
    const [m] = content('$$\na+b\n$$', assets({ math: new Map([['a+b', FAKE_SVG]]) })) as Node[]
    expect(m.svg).toBe('<svg/>')
    expect(m.alignment).toBe('center')
  })

  it('shows the TeX source when a formula could not be rendered', () => {
    const [m] = content('$$\n\\badmacro\n$$') as Node[]
    expect(m).toMatchObject({ text: '\\badmacro', font: 'Mono' })
  })

  it('inline $…$ goes through the inline converter, in italics', () => {
    const [p] = content('Area $x^2$ here') as Node[]
    expect((p.text as Node[]).find((r) => r.text === '«x^2»')).toMatchObject({ italics: true })
  })

  it('leaves prices alone', () => {
    expect(textOf(content('Costs $5 and $10 today.')[0])).toBe('Costs $5 and $10 today.')
  })

  it('converts inline TeX to readable Unicode', () => {
    expect(texToUnicode('x^2 + \\alpha_1')).toBe('x² + α₁')
    expect(texToUnicode('T(e)\\cap T(F)')).toContain('∩')
    expect(texToUnicode('\\frac{a}{b}')).toBe('(a)/(b)')
    expect(texToUnicode('\\bigl(E\\bigr)')).toBe('(E)')
  })

  it('renders display TeX to sized SVG with a concrete colour', () => {
    const r = texToSvg('E(F)=\\biguplus_{t\\in T(F)}\\bigl(E(t)\\cap E(F)\\bigr)', 10.5, '#123456')
    expect(r).not.toBeNull()
    expect(r!.svg.startsWith('<svg')).toBe(true)
    expect(r!.svg).not.toContain('currentColor')
    expect(r!.svg).toContain('#123456')
    expect(r!.width).toBeGreaterThan(50)
    expect(r!.height).toBeGreaterThan(10)
  })

  it('reports unrenderable TeX as null instead of throwing', () => {
    expect(texToSvg('\\frac{', 10.5, '#000')).toBeNull()
  })
})
