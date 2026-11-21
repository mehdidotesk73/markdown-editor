// The test inputs: the user's fixture (tests/conformance/fixture.md), split
// into cases, plus the official GFM spec examples (tests/conformance/gfm-spec.txt,
// the spec GitHub implements — CC-BY-SA 4.0, github/cmark-gfm).

export interface Case {
  id: string
  title: string
  /** The section heading it sits under, e.g. "16. Nested lists". */
  section: string
  input: string
}

const CASE_HEAD = /^### \[([A-Z]+-\d{3})\] (.*)$/gm
// A section title follows a "---" divider (a case may itself contain "## 1. …").
const SECTION_HEAD = /\n---\n\n## (\d+\. .*)$/gm

/** Split the fixture on its "### [ID] title" headings. */
export function fixtureCases(md: string): Case[] {
  const sections = [...md.matchAll(SECTION_HEAD)].map((m) => ({ at: m.index!, title: m[1] }))
  const lastSection = sections[sections.length - 1]?.title ?? ''
  const heads = [...md.matchAll(CASE_HEAD)]
  const cases = heads.map((m, i) => {
    const start = m.index! + m[0].length + 1
    const end = i + 1 < heads.length ? heads[i + 1].index! : md.length
    let input = md.slice(start, end)
    // The fixture's own section dividers ("---" then "## 12. Unordered lists" and
    // its intro) sit between cases; they belong to no case.
    const divider = [...input.matchAll(/\n---\n\n## \d+\. /g)].pop()
    if (divider) input = input.slice(0, divider.index! + 1)
    const section = sections.filter((s) => s.at < m.index!).pop()?.title ?? ''
    return { id: m[1], title: m[2], section, input: input.replace(/^\n+/, '').replace(/\n+$/, '\n') }
  })
  // Two unterminated constructs the fixture says must be run on their own.
  cases.push(
    {
      id: 'FENCE-021',
      title: 'Unclosed mermaid fence (EDGE, standalone)',
      section: lastSection,
      input: '```mermaid\nflowchart LR\n    A --> B\n\nA paragraph after it.\n',
    },
    {
      id: 'MATH-016',
      title: 'Unclosed block math (EDGE, standalone)',
      section: lastSection,
      input: '$$\nx = 1\n\nA paragraph after it.\n',
    },
  )
  return cases
}

export interface SpecExample {
  number: number
  section: string
  /** "" for core CommonMark, or the GFM extension name (table, strikethrough …). */
  extension: string
  markdown: string
  html: string
}

/** Sections about raw HTML: out of scope (the app sanitises HTML away). */
export const OUT_OF_SCOPE = new Set(['HTML blocks', 'Raw HTML', 'Disallowed Raw HTML (extension)'])

/** The examples in a CommonMark / GFM spec.txt ("→" stands for a tab). */
export function specExamples(spec: string): SpecExample[] {
  const fence = '`'.repeat(32)
  const out: SpecExample[] = []
  let section = ''
  const lines = spec.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{1,6} (.*)$/.exec(lines[i])
    if (h) section = h[1].trim()
    if (!lines[i].startsWith(`${fence} example`)) continue
    const extension = lines[i].slice(fence.length + ' example'.length).trim()
    const md: string[] = []
    const html: string[] = []
    let j = i + 1
    for (; lines[j] !== '.'; j++) md.push(lines[j])
    for (j++; lines[j] !== fence; j++) html.push(lines[j])
    i = j
    if (extension === 'disabled') continue
    const tabs = (s: string) => s.replace(/→/g, '\t')
    out.push({
      number: out.length + 1,
      section,
      extension,
      markdown: tabs(md.join('\n') + (md.length ? '\n' : '')),
      html: tabs(html.join('\n') + (html.length ? '\n' : '')),
    })
  }
  return out
}
