import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import { marked } from './markdownParser'

// Links in rendered markdown open in a new tab, so clicking one never
// navigates away from an editor holding unsaved text.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Markdown (GitHub-flavoured, with math) → sanitized HTML. Safe to bind with v-html. */
export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md) as string)
}
