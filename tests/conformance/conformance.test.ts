import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureCases, specExamples } from './cases'
import { outline } from './outline'
import { applyAdditions, expectedOutline } from './expected'

const dir = join(__dirname)

describe('conformance harness', () => {
  it('splits the fixture into its cases, with unique ids, plus the two standalone ones', () => {
    const cases = fixtureCases(readFileSync(join(dir, 'fixture.md'), 'utf8'))
    expect(cases).toHaveLength(328)
    expect(new Set(cases.map((c) => c.id)).size).toBe(328)
    const hdg = cases.find((c) => c.id === 'HDG-011')!
    expect(hdg.section).toBe('1. Headings')
    expect(hdg.input).not.toContain('## 2. Paragraphs') // the section divider belongs to no case
    expect(cases.find((c) => c.id === 'HDG-009')!.input).toContain('## 1. Numbered heading')
  })

  it('reads the GFM spec examples, tabs restored', () => {
    const ex = specExamples(readFileSync(join(dir, 'gfm-spec.txt'), 'utf8'))
    expect(ex.length).toBeGreaterThan(600)
    expect(ex[0].markdown).toContain('\t')
  })

  it('outlines structure, not cosmetics', () => {
    const a = outline('<ol start="3">\n<li><p>one <strong>b</strong></p></li><li>two</li></ol>')
    expect(a).toBe('ol start=3\n  li\n    p: one **b**\n  li\n    text: two')
    // Wrappers, attribute order and whitespace don't matter; tight vs loose does.
    expect(outline('<div><ul><li>x</li></ul></div>')).toBe(outline('<ul>\n  <li>x</li>\n</ul>'))
    expect(outline('<ul><li><p>x</p></li></ul>')).not.toBe(outline('<ul><li>x</li></ul>'))
    expect(outline('<ul><li><input type="checkbox" checked disabled> done</li></ul>')).toBe('ul\n  li [x]\n    text: done')
    expect(outline('<pre><code class="language-py">a\n  b\n</code></pre>')).toBe('code lang=py\n  | a\n  |   b')
  })

  it('applies our additions to the reference: mermaid, ```math, {labels}', () => {
    expect(expectedOutline('```mermaid\nA-->B\n```\n')).toBe('diagram mermaid\n  | A-->B')
    expect(expectedOutline('```math\nx^2\n```\n')).toBe('math-block: x^2')
    expect(expectedOutline('- {1.1} Goals\n- {1.2} Scope\n')).toBe('ul\n  li label=1.1\n    text: Goals\n  li label=1.2\n    text: Scope')
    // Labels only on bullets, and only at the start.
    expect(applyAdditions(['ol', '  li', '    text: {1} x'])).toEqual(['ol', '  li', '    text: {1} x'])
    expect(expectedOutline('- see {1.1} here\n')).toBe('ul\n  li\n    text: see {1.1} here')
  })
})
