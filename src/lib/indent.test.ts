import { describe, it, expect } from 'vitest'
import { indentEdit, INDENT, type IndentEdit } from './indent'

function apply(text: string, e: IndentEdit) {
  const out = text.slice(0, e.from) + e.insert + text.slice(e.to)
  return { out, sel: out.slice(e.selStart, e.selEnd) }
}

describe('indentEdit', () => {
  const doc = 'alpha\nbeta\n\ngamma\ndelta'

  it('Tab with no selection inserts an indent at the cursor', () => {
    const e = indentEdit(doc, 2, 2, false)
    expect(apply(doc, e).out).toBe('al' + INDENT + 'pha\nbeta\n\ngamma\ndelta')
    expect(e.selStart).toBe(2 + INDENT.length)
  })

  it('Tab indents every line the selection touches, keeping the same text selected', () => {
    const start = doc.indexOf('pha')
    const end = doc.indexOf('gam') + 2
    const { out, sel } = apply(doc, indentEdit(doc, start, end, false))
    expect(out).toBe('  alpha\n  beta\n\n  gamma\ndelta') // empty line untouched, delta not selected
    expect(sel).toBe('pha\n  beta\n\n  ga')
  })

  it("doesn't include a line the selection only reaches at column 0", () => {
    const start = 0
    const end = doc.indexOf('beta')
    const { out } = apply(doc, indentEdit(doc, start, end, false))
    expect(out).toBe('  alpha\nbeta\n\ngamma\ndelta')
  })

  it('Shift+Tab outdents every selected line by one level, tabs or spaces', () => {
    const text = '    one\n  two\n\tthree\nfour'
    const { out, sel } = apply(text, indentEdit(text, 0, text.length, true))
    expect(out).toBe('  one\ntwo\nthree\nfour')
    expect(sel).toBe(out)
  })

  it('Shift+Tab with no selection outdents the current line and keeps the cursor on its text', () => {
    const text = 'x\n    item\ny'
    const at = text.indexOf('item') + 2
    const e = indentEdit(text, at, at, true)
    const { out } = apply(text, e)
    expect(out).toBe('x\n  item\ny')
    expect(out.slice(e.selStart, e.selStart + 2)).toBe('em')
  })

  it('Tab then Shift+Tab restores the original text', () => {
    const e1 = indentEdit(doc, 0, doc.length, false)
    const a = apply(doc, e1).out
    const e2 = indentEdit(a, e1.selStart, e1.selEnd, true)
    expect(apply(a, e2).out).toBe(doc)
  })
})
