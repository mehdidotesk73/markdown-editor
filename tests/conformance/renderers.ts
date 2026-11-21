// The renderers under test: each turns markdown into the HTML the preview shows
// (before sanitising — sanitising removes, it doesn't restructure).
// The new structural renderer joins this list beside the current one.

import { marked } from '../../src/lib/markdownParser'
import { toHtml } from '../../src/lib/md'

export const RENDERERS: Record<string, (md: string) => string> = {
  current: (md) => marked.parse(md) as string,
  next: toHtml,
}
