import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
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

/** The same parse the preview uses, as tokens (for the PDF export). */
export function lexMarkdown(md: string) {
  return marked.lexer(md)
}
