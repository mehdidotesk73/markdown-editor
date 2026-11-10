import { describe, it, expect } from 'vitest'
import { lexMarkdown, marked } from './markdownParser'
import { scanAlphaList } from './alphaList'

describe('lettered lists', () => {
  it('renders a) b) as a lower-alpha ordered list', () => {
    const html = marked.parse('a) something\nb) something else\n') as string
    expect(html).toContain('<ol type="a">')
    expect(html).toContain('<li>something</li>')
    expect(html).toContain('<li>something else</li>')
  })

  it('renders A. B. as an upper-alpha list, with inline markdown inside', () => {
    const html = marked.parse('A. **bold** first\nB. second\n') as string
    expect(html).toContain('<ol type="A">')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('leaves a single lettered line, and numbered lists, alone', () => {
    expect(marked.parse('A. Lincoln wrote this.\n') as string).not.toContain('<ol')
    const nums = marked.parse('1. one\n2. two\n') as string
    expect(nums).toContain('<ol>')
    expect(nums).not.toContain('type=')
  })

  it('needs the letters in order from a / A, and stops where they break', () => {
    expect(scanAlphaList('b) x\nc) y')).toBeNull()
    const s = scanAlphaList('a) x\nb) y\nd) z')!
    expect(s.items).toEqual(['x', 'y'])
    expect(scanAlphaList('a) x\nB) y')).toBeNull()
  })

  it('joins indented continuation lines into the item', () => {
    expect(scanAlphaList('a) first\n   more\nb) second')!.items).toEqual(['first more', 'second'])
  })

  it('keeps the paragraphs around it, and gives the PDF a list token with alpha', () => {
    const toks = lexMarkdown('Intro line.\n\na) one\nb) two\n\nAfter.')
    const types = toks.filter((t) => t.type !== 'space').map((t) => t.type)
    expect(types).toEqual(['paragraph', 'list', 'paragraph'])
    expect((toks.find((t) => t.type === 'list') as unknown as { alpha: string }).alpha).toBe('lower')
  })
})
