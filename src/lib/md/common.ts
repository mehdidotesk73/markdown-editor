// Shared pieces of the CommonMark rules: escapes, entities, link labels, URLs.

import { decodeHTMLStrict } from 'entities'

export const ESCAPABLE = '[!"#$%&\'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]'
export const ENTITY = '&(?:#[xX][0-9a-fA-F]{1,6};|#[0-9]{1,7};|[A-Za-z][A-Za-z0-9]{1,31};)'

const reEntityOrEscaped = new RegExp(`\\\\${ESCAPABLE}|${ENTITY}`, 'g')
export const reEntityHere = new RegExp(`^${ENTITY}`)

/** Decode one entity reference ("&amp;"), or return it unchanged if it isn't one. */
export function decodeEntity(s: string): string {
  return decodeHTMLStrict(s)
}

/** Resolve backslash escapes and entity references (link destinations, titles, info strings). */
export function unescapeString(s: string): string {
  return s.replace(reEntityOrEscaped, (m) => (m[0] === '\\' ? m.slice(1) : decodeEntity(m)))
}

/** A link label as it is matched: case-folded, inner whitespace collapsed. */
export function normalizeLabel(label: string): string {
  return label.trim().replace(/[ \t\r\n]+/g, ' ').toLowerCase().toUpperCase()
}

// Characters a URL keeps as they are; anything else is percent-encoded
// (an existing "%XX" escape is left alone).
const URL_SAFE = /[!#$&-;=?-Z_a-z~]/

/** Percent-encode a link destination the way the reference renderer does. */
export function normalizeUri(uri: string): string {
  let out = ''
  for (let i = 0; i < uri.length; i++) {
    const c = uri[i]
    if (c === '%' && /^[0-9A-Fa-f]{2}$/.test(uri.slice(i + 1, i + 3))) {
      out += uri.slice(i, i + 3)
      i += 2
    } else if (URL_SAFE.test(c)) out += c
    else {
      const code = uri.charCodeAt(i)
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < uri.length) {
        out += encodeURIComponent(uri.slice(i, i + 2))
        i++
      } else if (code >= 0xd800 && code <= 0xdfff) out += '%EF%BF%BD'
      else out += encodeURIComponent(c)
    }
  }
  return out
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const isSpaceOrTab = (c: string | undefined) => c === ' ' || c === '\t'
export const isLineEnd = (c: string | undefined) => c === undefined || c === '\n' || c === '\r'

/** Unicode whitespace, as the emphasis and autolink rules mean it. */
export const isUnicodeWhitespace = (c: string | undefined) => c === undefined || /^\s$/u.test(c)
/** Unicode punctuation (P*) and symbols (S*), as CommonMark counts them for emphasis. */
export const isPunctuation = (c: string | undefined) => c !== undefined && /^[\p{P}\p{S}]$/u.test(c)

// Raw HTML (inline and in blocks), from the CommonMark spec.
const TAGNAME = '[A-Za-z][A-Za-z0-9-]*'
const ATTRIBUTENAME = '[a-zA-Z_:][a-zA-Z0-9:._-]*'
const UNQUOTEDVALUE = '[^"\'=<>`\\x00-\\x20]+'
const ATTRIBUTEVALUE = `(?:${UNQUOTEDVALUE}|'[^']*'|"[^"]*")`
const ATTRIBUTE = `(?:\\s+${ATTRIBUTENAME}(?:\\s*=\\s*${ATTRIBUTEVALUE})?)`
export const OPENTAG = `<${TAGNAME}${ATTRIBUTE}*\\s*/?>`
export const CLOSETAG = `</${TAGNAME}\\s*[>]`
const HTMLCOMMENT = '<!-->|<!--->|<!--[\\s\\S]*?-->'
const PROCESSINGINSTRUCTION = '[<][?][\\s\\S]*?[?][>]'
const DECLARATION = '<![A-Za-z]+[^>]*>'
const CDATA = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>'
export const reHtmlTag = new RegExp(
  `^(?:${OPENTAG}|${CLOSETAG}|${HTMLCOMMENT}|${PROCESSINGINSTRUCTION}|${DECLARATION}|${CDATA})`,
)
