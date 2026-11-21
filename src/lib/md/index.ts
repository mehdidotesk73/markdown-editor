// The structural markdown renderer: CommonMark + GFM, as GitHub renders them,
// plus our additions (tests/conformance/RULES.md): Mermaid, math, {label}
// bullets, numbered todos, alerts.
//
//   parse(md)      → the document tree (blocks.ts, inlines.ts, ast.ts)
//   toHtml(md)     → preview HTML (html.ts); the PDF reads the same tree

import { BlockParser } from './blocks'
import { renderHtml } from './html'
import type { Block } from './ast'

export function parse(md: string): Block {
  return new BlockParser().parse(md).doc
}

export function toHtml(md: string): string {
  return renderHtml(parse(md))
}

export type { Block, Inline } from './ast'
