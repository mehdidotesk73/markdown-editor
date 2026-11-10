// The nine looks from the user's theme canvas (Markdown Lab Looks). Each id is
// a `data-theme` value with a token block in styles/vars.css; Sage's tokens sit
// on :root, so it needs no block. `bg` is the page colour (browser chrome +
// the swatch in the menu), `swatch` the look's main-action colour.

export type ThemeMode = 'dark' | 'light'
export interface ThemeInfo {
  id: string
  label: string
  mode: ThemeMode
  bg: string
  swatch: string
}

export const THEMES: ThemeInfo[] = [
  { id: 'sage', label: 'Sage', mode: 'dark', bg: '#141815', swatch: '#c9d3c4' },
  { id: 'original', label: 'Original', mode: 'dark', bg: '#0b0f18', swatch: '#dbd6ce' },
  { id: 'graphite', label: 'Graphite', mode: 'dark', bg: '#17181a', swatch: '#d3d0c9' },
  { id: 'midnight', label: 'Midnight & Champagne', mode: 'dark', bg: '#08090c', swatch: '#cebe9f' },
  { id: 'sand', label: 'Smoke & Sand', mode: 'dark', bg: '#1e1c19', swatch: '#d7cbb7' },
  { id: 'mono', label: 'Monochrome', mode: 'dark', bg: '#0a0a0a', swatch: '#dad8d3' },
  { id: 'navy', label: 'Navy & Brass', mode: 'dark', bg: '#0e1626', swatch: '#bea576' },
  { id: 'porcelain', label: 'Porcelain', mode: 'light', bg: '#f2f0eb', swatch: '#2b2b30' },
  { id: 'fog', label: 'Fog', mode: 'light', bg: '#e8ebef', swatch: '#2b3038' },
]

export const DEFAULT_DARK = 'sage'
export const DEFAULT_LIGHT = 'porcelain'

export function themeById(id: string | null | undefined): ThemeInfo | undefined {
  return THEMES.find((t) => t.id === id)
}
