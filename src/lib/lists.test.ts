import { describe, it, expect } from 'vitest'
import type { Tokens } from 'marked'
import { lexMarkdown, marked } from './markdownParser'
import type { MlList } from './lists'

// A list as a compact outline: "1." / "a)" / "-" markers, item text, children.
type Shape = { m: string; items: (string | [string, ...Shape[]])[] }
function shape(l: MlList): Shape {
  const first = l.alpha ? (l.alpha === 'upper' ? 'A' : 'a') : l.ordered ? String(l.start) : '-'
  const m = l.ordered ? first + l.delim : '-'
  return {
    m,
    items: l.items.map((it) => {
      const text = it.tokens.filter((t) => t.type === 'text').map((t) => (t as Tokens.Text).text).join(' ')
      const kids = it.tokens.filter((t) => t.type === 'list').map((t) => shape(t as MlList))
      return kids.length ? ([text, ...kids] as [string, ...Shape[]]) : text
    }),
  }
}
const lists = (md: string) => lexMarkdown(md).filter((t) => t.type === 'list').map((t) => shape(t as MlList))
const only = (md: string) => {
  const ls = lists(md)
  expect(ls).toHaveLength(1)
  return ls[0]
}

describe('lists: markers', () => {
  it.each([
    ['1. one\n2. two', '1.'],
    ['1) one\n2) two', '1)'],
    ['a. one\nb. two', 'a.'],
    ['a) one\nb) two', 'a)'],
    ['A. one\nB. two', 'A.'],
    ['A) one\nB) two', 'A)'],
    ['- one\n- two', '-'],
    ['* one\n* two', '-'],
  ])('%j is one list with marker %s', (md, m) => {
    expect(only(md)).toEqual({ m, items: ['one', 'two'] })
  })

  it('renders the marker style the way it was typed', () => {
    expect(marked.parse('a) x\nb) y') as string).toContain('<ol type="a" class="alpha-lower paren">')
    expect(marked.parse('A. x\nB. y') as string).toContain('<ol type="A" class="alpha-upper">')
    expect(marked.parse('1) x\n2) y') as string).toContain('<ol class="paren">')
    const plain = marked.parse('1. x\n2. y') as string
    expect(plain).toContain('<ol>')
    expect(plain).toContain('<li>x</li>')
    expect(marked.parse('3. x\n4. y') as string).toContain('<ol start="3">')
  })

  it('leaves a lone lettered line as a sentence, and needs letters in order from a / A', () => {
    expect(marked.parse('A. Lincoln wrote this.\n') as string).not.toContain('<ol')
    expect(lists('b) x\nc) y')).toEqual([])
    expect(only('a) x\nb) y\nd) z')).toEqual({ m: 'a)', items: ['x', 'y\nd) z'] })
  })

  it('splits a list where the marker kind changes', () => {
    expect(lists('1. x\n2. y\na) p\nb) q')).toEqual([
      { m: '1.', items: ['x', 'y'] },
      { m: 'a)', items: ['p', 'q'] },
    ])
  })
})

describe('lists: nesting', () => {
  // Every pairing of ordered markers, nested two deep, with 2- and 3-space indents.
  const kinds = [
    ['1.', ['1.', '2.']],
    ['1)', ['1)', '2)']],
    ['a.', ['a.', 'b.']],
    ['a)', ['a)', 'b)']],
    ['A.', ['A.', 'B.']],
    ['A)', ['A)', 'B)']],
  ] as const
  for (const [outer, [o1, o2]] of kinds)
    for (const [inner, [i1, i2]] of kinds)
      for (const pad of ['  ', '   ', '    '])
        it(`${outer} > ${inner} (indent ${pad.length})`, () => {
          const md = `${o1} one\n${o2} two\n${pad}${i1} sub one\n${pad}${i2} sub two\n`
          expect(only(md)).toEqual({ m: outer, items: ['one', ['two', { m: inner, items: ['sub one', 'sub two'] }]] })
        })

  it('a single nested item under a numbered item (the "2. item2 / a. item2a" case)', () => {
    expect(only('1. item1\n2. item2\n  a. item2a')).toEqual({ m: '1.', items: ['item1', ['item2', { m: 'a.', items: ['item2a'] }]] })
  })

  it('a lettered list with nested letters and back out (A) / a. / B))', () => {
    expect(only('A) itemA\n  a. itemAa\nB) itemB')).toEqual({ m: 'A)', items: [['itemA', { m: 'a.', items: ['itemAa'] }], 'itemB'] })
    expect(only('A) itemA\n  a. itemAa\n  b. itemAb\nB) itemB')).toEqual({
      m: 'A)',
      items: [['itemA', { m: 'a.', items: ['itemAa', 'itemAb'] }], 'itemB'],
    })
  })

  it('three levels deep, and back out to each level', () => {
    const md = '1. one\n   a) sub\n      i. not a list start, so text\n      - deep\n   b) sub two\n2. two'
    expect(only(md)).toEqual({
      m: '1.',
      items: [['one', { m: 'a)', items: [['sub\ni. not a list start, so text', { m: '-', items: ['deep'] }], 'sub two'] }], 'two'],
    })
  })

  it('bullets inside numbers, and numbers / letters inside bullets', () => {
    expect(only('1. one\n  - x\n  - y\n2. two')).toEqual({ m: '1.', items: [['one', { m: '-', items: ['x', 'y'] }], 'two'] })
    expect(only('- one\n  1) x\n  2) y\n- two')).toEqual({ m: '-', items: [['one', { m: '1)', items: ['x', 'y'] }], 'two'] })
    expect(only('* one\n  A. x\n  B. y')).toEqual({ m: '-', items: [['one', { m: 'A.', items: ['x', 'y'] }]] })
  })

  it('two different nested lists under one item', () => {
    expect(only('1. one\n  a) x\n  - y')).toEqual({ m: '1.', items: [['one', { m: 'a)', items: ['x'] }, { m: '-', items: ['y'] }]] })
  })

  it('blank lines between items keep one list, tight', () => {
    const md = '1. one\n\n2. two\n\n   a. sub\n\n3. three'
    expect(only(md)).toEqual({ m: '1.', items: ['one', ['two', { m: 'a.', items: ['sub'] }], 'three'] })
    const html = marked.parse(md) as string
    expect(html).not.toContain('<p>')
  })

  it('joins wrapped lines into the item, and keeps the text around the list', () => {
    expect(only('a) first\n   more\nb) second')).toEqual({ m: 'a)', items: ['first\nmore', 'second'] })
    const types = lexMarkdown('Intro line.\n\na) one\nb) two\n\nAfter.')
      .filter((t) => t.type !== 'space')
      .map((t) => t.type)
    expect(types).toEqual(['paragraph', 'list', 'paragraph'])
  })

  it('keeps task boxes, code inside items, and horizontal rules', () => {
    const html = marked.parse('- [x] done\n- [ ] todo') as string
    expect(html).toContain('<input type="checkbox" disabled checked>')
    expect(html).toContain('class="task"')
    expect(marked.parse('1. code:\n\n   ```\n   x = 1\n   ```\n2. next') as string).toContain('<pre><code>x = 1')
    expect(lexMarkdown('- a\n\n---\n').map((t) => t.type)).toContain('hr')
    expect(lexMarkdown('* * *\n').map((t) => t.type)).toEqual(['hr'])
  })
})
