import DOMPurify from 'dompurify'
import 'katex/dist/katex.min.css'
import { toHtml } from './md'

// Links in rendered markdown open in a new tab, so clicking one never
// navigates away from an editor holding unsaved text.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * Markdown → sanitized HTML. Safe to bind with v-html. The structural renderer
 * (lib/md): CommonMark + GFM as GitHub renders them, plus math, Mermaid, labels
 * and alerts — see tests/conformance/RULES.md.
 */
export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(toHtml(md))
}
