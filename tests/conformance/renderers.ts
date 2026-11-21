// The renderers under test: each turns markdown into the HTML the preview shows
// (before sanitising — sanitising removes, it doesn't restructure).
//
// "app" is the structural renderer (src/lib/md) the preview and PDF use. The
// marked-based renderer it replaced scored 552 / 606 spec and 242 / 328 fixture.

import { toHtml } from '../../src/lib/md'

export const RENDERERS: Record<string, (md: string) => string> = {
  app: toHtml,
}
