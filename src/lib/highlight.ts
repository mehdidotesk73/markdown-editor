// Syntax highlighting for the preview's code blocks, by Shiki (the grammars VS
// Code uses). Nothing loads until a block names a language Shiki knows: then
// the Shiki core (once) and that one grammar (once) are fetched as lazy chunks.
// Until they arrive the block stays plain code. Colours are CSS variables
// (--code-token-*, set per look in vars.css), so a look change needs no redraw.
// The PDF keeps code plain.

import type { HighlighterCore } from 'shiki/core'

const THEME = 'ml'

let core: Promise<{ hl: HighlighterCore; langs: Record<string, () => Promise<unknown>> }> | null = null
function loadCore() {
  core ??= (async () => {
    const [{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }, { bundledLanguages }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
      import('shiki/langs'),
    ])
    const theme = createCssVariablesTheme({ name: THEME, variablePrefix: '--code-', variableDefaults: {}, fontStyle: true })
    const hl = await createHighlighterCore({ themes: [theme], langs: [], engine: createJavaScriptRegexEngine() })
    return { hl, langs: bundledLanguages as unknown as Record<string, () => Promise<unknown>> }
  })()
  return core
}

/** Load a grammar once; false if Shiki has none by that name or alias. */
const loading = new Map<string, Promise<boolean>>()
async function loadLang(lang: string): Promise<boolean> {
  let p = loading.get(lang)
  if (!p) {
    p = (async () => {
      const { hl, langs } = await loadCore()
      const loader = langs[lang]
      if (!loader) return false
      await hl.loadLanguage(loader as never)
      return true
    })().catch(() => false)
    loading.set(lang, p)
  }
  return p
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const FONT_STYLE: [number, string][] = [
  [1, 'font-style:italic'],
  [2, 'font-weight:bold'],
  [4, 'text-decoration:underline'],
]

/** Code → coloured HTML (spans with CSS-variable colours). */
async function toHtml(code: string, lang: string): Promise<string> {
  const { hl } = await loadCore()
  const lines = hl.codeToTokens(code, { lang, theme: THEME }).tokens
  return lines
    .map((line) =>
      line
        .map((t) => {
          const style = [t.color ? `color:${t.color}` : '', ...FONT_STYLE.filter(([bit]) => (t.fontStyle ?? 0) & bit).map(([, s]) => s)].filter(Boolean)
          return style.length ? `<span style="${style.join(';')}">${escape(t.content)}</span>` : escape(t.content)
        })
        .join(''),
    )
    .join('\n')
}

// Coloured HTML per language + code, so re-renders on each keystroke swap
// unchanged blocks in at once (no flash of plain code) and only edited ones redo.
const cache = new Map<string, string>()

/** Colour every `pre > code.language-x` under root whose language Shiki knows. */
export async function hydrateCode(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre > code[class*="language-"]')).filter(
    (el) => !el.closest('.mermaid-block') && !el.dataset.highlighted,
  )
  const pending: Promise<void>[] = []
  for (const el of blocks) {
    const lang = /(?:^|\s)language-(\S+)/.exec(el.className)?.[1]?.toLowerCase()
    if (!lang) continue
    const code = el.textContent ?? ''
    const key = `${lang}\n${code}`
    const apply = (html: string) => {
      if (!el.isConnected || el.textContent !== code) return
      el.innerHTML = html
      el.dataset.highlighted = lang
    }
    const hit = cache.get(key)
    if (hit !== undefined) {
      apply(hit)
      continue
    }
    pending.push(
      (async () => {
        if (!(await loadLang(lang))) return
        const html = await toHtml(code, lang)
        if (cache.size > 200) cache.clear()
        cache.set(key, html)
        apply(html)
      })().catch(() => {}),
    )
  }
  await Promise.all(pending)
}
