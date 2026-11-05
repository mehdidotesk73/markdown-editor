import { Marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'

// GitHub-flavoured markdown plus LaTeX math via KaTeX:
//   inline  $x^2$          display  $$ E = mc^2 $$  (or $$ on their own lines)
// Standard (not "nonStandard") mode, so prices like "$5 and $10" stay text.
// throwOnError: false shows a bad formula in red instead of breaking the page.
const marked = new Marked({ gfm: true, async: false }, markedKatex({ throwOnError: false }))

// Links in rendered markdown open in a new tab, so clicking one never
// navigates away from an editor holding unsaved text.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** The same parse the preview uses, as tokens (for the PDF export). */
export function lexMarkdown(md: string) {
  return marked.lexer(md)
}

/** Markdown (GitHub-flavoured, with math) → sanitized HTML. Safe to bind with v-html. */
export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md) as string)
}
