import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import type { Tokens } from 'marked'
import { alphaListExtension } from './alphaList'

// The one markdown parser, shared by the preview (lib/markdown.ts) and the PDF
// export (lib/exportPdf.ts), so both read a document identically. No DOM here,
// so it also runs under the unit tests.
//
// GitHub-flavoured markdown plus LaTeX math via KaTeX:
//   inline  $x^2$          display  $$ E = mc^2 $$  (or $$ on their own lines)
// Standard (not "nonStandard") mode, so prices like "$5 and $10" stay text.
// throwOnError: false shows a bad formula in red instead of breaking the page.
// Plus lettered lists (a) b) c) / A. B. C.) — see alphaList.ts.
export const marked = new Marked({ gfm: true, async: false }, markedKatex({ throwOnError: false }), alphaListExtension)

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ```mermaid blocks become a placeholder holding the source as code (shown
// until the diagram is drawn); lib/diagram.ts reads it from there and draws
// the diagram in the preview. (Not in an attribute: DOMPurify strips any
// attribute containing "-->", which every Mermaid arrow does.) The PDF export
// reads the same `code` token (lang "mermaid").
marked.use({
  renderer: {
    code(token: Tokens.Code) {
      if ((token.lang ?? '').trim().toLowerCase() !== 'mermaid') return false
      const src = escapeHtml(token.text)
      return `<div class="mermaid-block"><pre><code>${src}</code></pre></div>\n`
    },
  },
})

/** The same parse the preview uses, as tokens (for the PDF export). */
export function lexMarkdown(md: string) {
  return marked.lexer(md)
}
