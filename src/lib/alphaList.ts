import type { MarkedExtension, Tokens } from 'marked'

// Lettered lists — "a) …  b) …" or "A. …  B. …" — which plain markdown doesn't
// have (it would run the lines together into one paragraph).
//
// A run of lines counts as a lettered list when it starts at a / A and the
// letters go up one at a time (a, b, c…) in the same case, with at least two
// items — so a lone "A. Lincoln wrote…" stays a sentence. An item can wrap onto
// following lines indented by two or more spaces. The result is an ordinary
// ordered `list` token with `alpha: 'lower' | 'upper'`, so the preview and the
// PDF export treat it like any other list, just with letter markers.

export type AlphaList = Tokens.List & { alpha: 'lower' | 'upper' }

const ITEM = /^ {0,3}([a-zA-Z])[.)] +(.*)$/
const CONTINUATION = /^ {2,}\S/

/** Parse the lettered list at the start of `src`, if there is one. */
export function scanAlphaList(src: string): { raw: string; upper: boolean; items: string[] } | null {
  const lines = src.split('\n')
  const items: string[] = []
  let upper = false
  let used = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = ITEM.exec(line)
    if (m) {
      const letter = m[1]
      if (items.length === 0) {
        if (letter !== 'a' && letter !== 'A') return null
        upper = letter === 'A'
      } else {
        const expected = String.fromCharCode((upper ? 65 : 97) + items.length)
        if (letter !== expected) break
      }
      items.push(m[2].trim())
      used = i + 1
      continue
    }
    if (items.length && CONTINUATION.test(line)) {
      items[items.length - 1] += ' ' + line.trim()
      used = i + 1
      continue
    }
    break
  }
  if (items.length < 2) return null
  let raw = lines.slice(0, used).join('\n')
  if (used < lines.length) raw += '\n'
  return { raw, upper, items }
}

export const alphaListExtension: MarkedExtension = {
  extensions: [
    {
      name: 'alphaList',
      level: 'block',
      start(src: string) {
        const m = /(^|\n) {0,3}[aA][.)] /.exec(src)
        return m ? m.index + m[1].length : undefined
      },
      tokenizer(src: string) {
        const found = scanAlphaList(src)
        if (!found) return undefined
        const items: Tokens.ListItem[] = found.items.map((text) => ({
          type: 'list_item',
          raw: text,
          task: false,
          loose: false,
          text,
          tokens: [{ type: 'text', raw: text, text, tokens: this.lexer.inlineTokens(text) } as Tokens.Text],
        }))
        const token: AlphaList = {
          type: 'list',
          raw: found.raw,
          ordered: true,
          start: 1,
          loose: false,
          items,
          alpha: found.upper ? 'upper' : 'lower',
        }
        return token as unknown as Tokens.Generic
      },
    },
  ],
  renderer: {
    // Ordinary lists fall through to marked's own renderer.
    list(token: Tokens.List) {
      const alpha = (token as Partial<AlphaList>).alpha
      if (!alpha) return false
      const body = token.items.map((it) => `<li>${this.parser.parseInline((it.tokens[0] as Tokens.Text).tokens ?? [])}</li>\n`).join('')
      return `<ol type="${alpha === 'upper' ? 'A' : 'a'}">\n${body}</ol>\n`
    },
  },
}
