// Mermaid diagrams (```mermaid fenced blocks), for the preview and the PDF.
// Mermaid is large, so it's a lazy chunk: only documents with a diagram load
// it. Labels are drawn as SVG text (htmlLabels: false), never HTML inside a
// <foreignObject>, so the same SVG works in the preview and in the PDF (whose
// SVG renderer can't draw HTML). securityLevel 'strict' escapes label text.

import { logDebug } from '../debug'

type Mermaid = typeof import('mermaid').default

let mermaidP: Promise<Mermaid> | null = null
function loadMermaid(): Promise<Mermaid> {
  mermaidP ??= import('mermaid').then((m) => m.default)
  return mermaidP
}

/** Colours (and font) a diagram is drawn with. */
export interface DiagramStyle {
  background: string
  text: string
  /** Node fill. */
  node: string
  nodeBorder: string
  line: string
  /** Fill behind edge labels. */
  labelBg: string
  font: string
}

// Mermaid keeps one global config, so renders run one at a time.
let queue: Promise<unknown> = Promise.resolve()
let seq = 0

/** Mermaid source → SVG markup, or null if the source doesn't parse. */
export function renderMermaid(source: string, style: DiagramStyle): Promise<string | null> {
  const job = queue.then(async () => {
    const mermaid = await loadMermaid()
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      // Classic look: flat boxes. The newer look's drop shadows don't survive the PDF.
      look: 'classic',
      theme: 'base',
      fontFamily: style.font,
      themeVariables: {
        background: style.background,
        primaryColor: style.node,
        primaryBorderColor: style.nodeBorder,
        primaryTextColor: style.text,
        secondaryColor: style.node,
        tertiaryColor: style.background,
        lineColor: style.line,
        textColor: style.text,
        edgeLabelBackground: style.labelBg,
        fontFamily: style.font,
      },
    })
    const id = `mermaid-${++seq}`
    try {
      const { svg } = await mermaid.render(id, source)
      return svg
    } catch (e) {
      // Shown in the footer's View logs (no console on phones).
      logDebug(`Diagram not drawn: ${(e as Error).message?.split('\n')[0] ?? e}`, 'warn')
      return null
    } finally {
      // A failed render leaves its scratch element behind in <body>.
      document.getElementById(id)?.remove()
      document.getElementById(`d${id}`)?.remove()
    }
  })
  queue = job.catch(() => undefined)
  return job
}

/** The diagram's natural size in CSS px, from its viewBox. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const m = /viewBox="[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)"/.exec(svg)
  return m ? { width: parseFloat(m[1]), height: parseFloat(m[2]) } : null
}

// ---- the preview -----------------------------------------------------------

/** Diagram colours from the current look's panel tokens. */
function previewStyle(): DiagramStyle {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    background: v('--paper-bg'),
    text: v('--paper-text'),
    node: v('--paper-code-bg'),
    nodeBorder: v('--paper-muted'),
    line: v('--paper-muted'),
    labelBg: v('--paper-bg'),
    font: getComputedStyle(document.body).fontFamily,
  }
}

const previewCache = new Map<string, string | null>()

/**
 * Fill every `.mermaid-block` placeholder in the preview with its diagram.
 * Rendered SVGs are cached per look and source, so re-renders of the preview
 * on each keystroke swap them in at once and only an edited diagram redraws.
 */
export async function hydrateDiagrams(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block'))
  if (!blocks.length) return
  const look = document.documentElement.dataset.theme ?? ''
  for (const el of blocks) {
    // The source is the placeholder's code text; once drawn, the block keeps
    // it in a data attribute (set here, after sanitizing) for redraws on a look change.
    const source = el.dataset.mermaid ?? el.querySelector('code')?.textContent ?? ''
    el.dataset.mermaid = source
    const key = `${look}\n${source}`
    if (!previewCache.has(key)) {
      if (previewCache.size > 60) previewCache.clear()
      previewCache.set(key, await renderMermaid(source, previewStyle()))
    }
    const svg = previewCache.get(key)
    if (!el.isConnected) continue
    if (svg) {
      el.innerHTML = svg
      el.classList.add('is-rendered')
      el.classList.remove('is-error')
    } else {
      el.classList.add('is-error')
    }
  }
}

// ---- the PDF ---------------------------------------------------------------

const DIAGRAM_FONT = 'ML Diagram PDF'
const loadedFonts = new Map<string, Promise<void>>()

/**
 * Make the PDF's body font available to the page under one name, so Mermaid
 * measures labels with the same glyphs the PDF will draw them in.
 */
function usePdfFont(url: string): Promise<void> {
  let p = loadedFonts.get(url)
  if (!p) {
    p = (async () => {
      for (const f of Array.from(document.fonts)) if (f.family === `"${DIAGRAM_FONT}"` || f.family === DIAGRAM_FONT) document.fonts.delete(f)
      const face = new FontFace(DIAGRAM_FONT, `url(${url})`)
      await face.load()
      document.fonts.add(face)
    })()
    loadedFonts.clear() // only one PDF font is registered at a time
    loadedFonts.set(url, p)
  }
  return p
}

/** A diagram for the PDF: white page, the code-block tint for nodes, the body font for labels. */
export async function renderDiagramForPdf(
  source: string,
  tint: { bg: string; edge: string },
  fontUrl: string,
): Promise<{ svg: string; width: number; height: number } | null> {
  try {
    await usePdfFont(fontUrl)
  } catch {
    /* font failed to load: Mermaid measures with a fallback; labels may sit a little off */
  }
  const svg = await renderMermaid(source, {
    background: '#ffffff',
    text: '#1f2328',
    node: tint.bg,
    nodeBorder: tint.edge,
    line: '#59636e',
    labelBg: '#ffffff',
    font: DIAGRAM_FONT,
  })
  const size = svg ? svgSize(svg) : null
  return svg && size ? { svg: flattenForPdf(svg, size), ...size } : null
}

// The PDF's SVG renderer (svg-to-pdfkit, inside pdfmake) ignores <style>
// sheets and "100%" sizes, and Mermaid relies on both. So the diagram is laid
// out once in a hidden box, each element's computed colours, strokes and type
// are written onto it as attributes, the sheet is dropped, and the size is
// set in plain numbers.
const INLINE = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'display',
]

function flattenForPdf(svg: string, size: { width: number; height: number }): string {
  const host = document.createElement('div')
  // Off-screen, not visibility:hidden: that would be inherited and copied onto every element.
  host.style.cssText = 'position:absolute;left:-100000px;top:0;pointer-events:none'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    const root = host.querySelector('svg')
    if (!root) return svg
    // Read every element's computed style first, then write: removing a
    // parent's class before its children are read would unmatch rules like
    // ".node rect" and turn the boxes black.
    const els = Array.from(root.querySelectorAll<SVGElement>('*')).filter((el) => el.tagName.toLowerCase() !== 'style')
    const computed = els.map((el) => {
      const cs = getComputedStyle(el)
      return INLINE.map((prop) => [prop, cs.getPropertyValue(prop)] as const)
    })
    els.forEach((el, i) => {
      for (const [prop, v] of computed[i]) if (v && v !== 'normal' && v !== 'auto') el.setAttribute(prop, v)
      el.removeAttribute('style')
      el.removeAttribute('class')
    })
    for (const s of Array.from(root.querySelectorAll('style'))) s.remove()
    root.removeAttribute('style')
    root.setAttribute('width', String(size.width))
    root.setAttribute('height', String(size.height))
    root.setAttribute('font-family', DIAGRAM_FONT)
    return root.outerHTML
  } finally {
    host.remove()
  }
}
