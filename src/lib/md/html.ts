// The document tree → HTML for the preview. Raw HTML is passed through, as the
// standard says; the preview sanitises the result (lib/markdown.ts).

import katex from 'katex'
import type { Block, Inline } from './ast'
import { escapeHtml } from './common'
import { plainText } from './ast'

const ALERT_TITLES: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}

function mathHtml(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false, output: 'htmlAndMathml' })
}

export function inlineHtml(nodes: Inline[]): string {
  let out = ''
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        out += escapeHtml(n.value)
        break
      case 'softbreak':
        out += '\n'
        break
      case 'hardbreak':
        out += '<br />\n'
        break
      case 'code':
        out += `<code>${escapeHtml(n.value)}</code>`
        break
      case 'math':
        out += `<span class="math math-inline">${mathHtml(n.value, false)}</span>`
        break
      case 'html':
        out += n.value
        break
      case 'emph':
        out += `<em>${inlineHtml(n.children)}</em>`
        break
      case 'strong':
        out += `<strong>${inlineHtml(n.children)}</strong>`
        break
      case 'del':
        out += `<del>${inlineHtml(n.children)}</del>`
        break
      case 'link':
        out += `<a href="${escapeHtml(n.href)}"${n.title ? ` title="${escapeHtml(n.title)}"` : ''}>${inlineHtml(n.children)}</a>`
        break
      case 'image':
        out += `<img src="${escapeHtml(n.src)}" alt="${escapeHtml(plainText(n.children))}"${n.title ? ` title="${escapeHtml(n.title)}"` : ''} />`
        break
    }
  }
  return out
}

function blocksHtml(blocks: Block[], tight: boolean): string {
  return blocks.map((b) => blockHtml(b, tight)).join('')
}

function blockHtml(b: Block, tight = false): string {
  switch (b.type) {
    case 'document':
      return blocksHtml(b.children, false)
    case 'paragraph':
      return tight ? inlineHtml(b.inlines) : `<p>${inlineHtml(b.inlines)}</p>\n`
    case 'heading':
      return `<h${b.level}>${inlineHtml(b.inlines)}</h${b.level}>\n`
    case 'hr':
      return '<hr />\n'
    case 'blockquote':
      return `<blockquote>\n${blocksHtml(b.children, false)}</blockquote>\n`
    case 'alert':
      return (
        `<div class="markdown-alert markdown-alert-${b.alert}">\n` +
        `<p class="markdown-alert-title">${ALERT_TITLES[b.alert] ?? b.alert}</p>\n` +
        `${blocksHtml(b.children, false)}</div>\n`
      )
    case 'code': {
      const lang = b.info.split(/\s+/)[0]
      // A1: ```mermaid (exactly) is a diagram; the preview draws it (lib/diagram.ts).
      if (b.fenced && lang === 'mermaid')
        return `<div class="mermaid-block"><pre><code>${escapeHtml(b.content)}</code></pre></div>\n`
      return `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(b.content)}</code></pre>\n`
    }
    case 'math':
      return `<div class="math math-display">${mathHtml(b.content.replace(/\n$/, ''), true)}</div>\n`
    case 'html':
      return b.content
    case 'list': {
      const ld = b.list!
      const tag = ld.ordered ? 'ol' : 'ul'
      const start = ld.ordered && ld.start !== 1 ? ` start="${ld.start}"` : ''
      // "1)" lists keep their ")" on screen (display only; the standard doesn't say).
      const cls = ld.ordered && ld.marker === ')' ? ' class="paren"' : ''
      const items = b.children.map((item) => itemHtml(item, b.tight)).join('')
      return `<${tag}${start}${cls}>\n${items}</${tag}>\n`
    }
    case 'table': {
      const cell = (tag: string, c: Inline[], i: number) => {
        const a = b.align[i]
        return `<${tag}${a ? ` align="${a}"` : ''}>${inlineHtml(c)}</${tag}>\n`
      }
      const [head, ...body] = b.rows
      let out = `<table>\n<thead>\n<tr>\n${head.map((c, i) => cell('th', c, i)).join('')}</tr>\n</thead>\n`
      if (body.length) out += `<tbody>\n${body.map((r) => `<tr>\n${r.map((c, i) => cell('td', c, i)).join('')}</tr>\n`).join('')}</tbody>\n`
      return out + '</table>\n'
    }
    default:
      return ''
  }
}

function itemHtml(item: Block, tight: boolean): string {
  const attrs: string[] = []
  if (item.checked !== null) attrs.push('class="task"')
  if (item.label !== null) attrs.push(`data-label="${escapeHtml(item.label)}"`)
  const box = item.checked === null ? '' : `<input type="checkbox" disabled=""${item.checked ? ' checked=""' : ''} /> `
  let inner = blocksHtml(item.children, tight)
  // The box goes at the start of the first paragraph (bare text in a tight item).
  if (box) inner = inner.startsWith('<p>') ? `<p>${box}${inner.slice(3)}` : box + inner
  // A block-level first child starts on its own line, as the reference renderer writes it.
  const first = item.children[0]
  const nl = first && !(tight && first.type === 'paragraph') ? '\n' : ''
  return `<li${attrs.length ? ' ' + attrs.join(' ') : ''}>${nl}${inner}</li>\n`
}

export function renderHtml(doc: Block): string {
  return blockHtml(doc)
}
