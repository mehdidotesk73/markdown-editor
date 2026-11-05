import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Links in rendered markdown open in a new tab, so clicking one never
// navigates away from an editor holding unsaved text.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/** Markdown (GitHub-flavoured) → sanitized HTML. Safe to bind with v-html. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { gfm: true, async: false }) as string
  return DOMPurify.sanitize(html)
}
