// The gate: the structural renderer must pass every fixture case and every
// in-scope GFM spec example (graded as in run.ts) — in the preview's HTML and in
// the PDF's layout plan. Runs with `npm test`, so in CI.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureCases, specExamples, OUT_OF_SCOPE } from './cases'
import { expectedOutline } from './expected'
import { outline } from './outline'
import { parse, toHtml } from '../../src/lib/md'
import { buildDocument, type Content } from '../../src/lib/pdf/markdownToPdf'
import { pdfOutline } from './pdfOutline'

// No assets: diagrams, display math and images fall back to their text, which is
// what the plan check needs (the real drawings are checked in the PDF tests).
const plan = (md: string) =>
  pdfOutline((buildDocument(parse(md), 't', { math: new Map(), images: new Map(), inlineMath: (s) => s }) as { content: Content[] }).content)

const fixture = fixtureCases(readFileSync(join(__dirname, 'fixture.md'), 'utf8'))
const spec = specExamples(readFileSync(join(__dirname, 'gfm-spec.txt'), 'utf8')).filter((e) => !OUT_OF_SCOPE.has(e.section))

describe('structural renderer conformance', () => {
  it.each(fixture.map((c) => [c.id, c] as const))('fixture %s', (_id, c) => {
    expect(outline(toHtml(c.input))).toBe(expectedOutline(c.input))
  })
  it.each(spec.map((e) => [e.number, e] as const))('GFM spec example %i', (_n, e) => {
    expect(outline(toHtml(e.markdown))).toBe(expectedOutline(e.markdown))
  })
  // Raw HTML is out of scope for the PDF (it prints the text only).
  const specNoHtml = spec.filter((e) => !/<[A-Za-z/!?]/.test(e.markdown))
  it.each(fixture.map((c) => [c.id, c] as const))('PDF plan: fixture %s', (_id, c) => {
    expect(plan(c.input)).toBe(expectedOutline(c.input, { flat: true }))
  })
  it.each(specNoHtml.map((e) => [e.number, e] as const))('PDF plan: GFM spec example %i', (_n, e) => {
    expect(plan(e.markdown)).toBe(expectedOutline(e.markdown, { flat: true }))
  })
})
