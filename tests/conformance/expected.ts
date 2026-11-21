// What a case SHOULD render as, decided programmatically:
//
//   expected = additions( outline( reference(markdown) ) )
//
// The reference is micromark with its GFM and math extensions — a renderer that
// passes the whole CommonMark and GFM test suites, i.e. what GitHub does. Then
// our few deliberate additions are applied to its outline, each as one rule:
//
//   1. Mermaid   ```mermaid code blocks are drawn as diagrams (as on GitHub).
//   2. Math      $…$ / $$…$$ via the reference's math syntax (as on GitHub);
//                ```math code blocks are display math too (as on GitHub).
//   3. Labels    a bullet item that starts with {label} shows that label as
//                its marker: "- {1.1} Goals" → li label=1.1, text "Goals".
//
// Numbered todos keeping their number ("3. ☑") is display only: the structure
// is the standard one, so it needs no rule here.

import { micromark } from 'micromark'
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
  return applyAdditions(outline(referenceHtml(md)).split('\n')).join('\n')
}
