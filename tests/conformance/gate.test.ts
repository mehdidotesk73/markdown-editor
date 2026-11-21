// The gate: the structural renderer must pass every fixture case and every
// in-scope GFM spec example (graded as in run.ts). Runs with `npm test`, so in CI.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureCases, specExamples, OUT_OF_SCOPE } from './cases'
import { expectedOutline } from './expected'
import { outline } from './outline'
import { toHtml } from '../../src/lib/md'

const fixture = fixtureCases(readFileSync(join(__dirname, 'fixture.md'), 'utf8'))
const spec = specExamples(readFileSync(join(__dirname, 'gfm-spec.txt'), 'utf8')).filter((e) => !OUT_OF_SCOPE.has(e.section))

describe('structural renderer conformance', () => {
  it.each(fixture.map((c) => [c.id, c] as const))('fixture %s', (_id, c) => {
    expect(outline(toHtml(c.input))).toBe(expectedOutline(c.input))
  })
  it.each(spec.map((e) => [e.number, e] as const))('GFM spec example %i', (_n, e) => {
    expect(outline(toHtml(e.markdown))).toBe(expectedOutline(e.markdown))
  })
})
