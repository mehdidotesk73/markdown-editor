import { parse } from './md'
import type { Block, Inline } from './md/ast'
import { blockText, buildDocument, isMermaid, pdfCodeTint, BASE_SIZE, type PdfAssets, type PdfFont, type RenderedMath } from './pdf/markdownToPdf'
import { downloadBlob } from './fileAccess'

/** "notes.md" → "notes.pdf" */
export function pdfName(name: string): string {
  return name.replace(/\.(md|markdown|mdx|txt)$/i, '') + '.pdf'
}

// Fonts live in public/fonts (DejaVu, subset to Latin/Greek/Cyrillic plus
// punctuation, arrows and math symbols). pdfmake fetches them by URL on the
// first export; the service worker caches them for later and offline use.
function fontUrl(file: string) {
  return new URL(`fonts/${file}`, document.baseURI).href
}
const FONTS = {
  Sans: {
    normal: fontUrl('DejaVuSans.woff'),
    bold: fontUrl('DejaVuSans-Bold.woff'),
    italics: fontUrl('DejaVuSans-Oblique.woff'),
    bolditalics: fontUrl('DejaVuSans-BoldOblique.woff'),
  },
  Serif: {
    normal: fontUrl('DejaVuSerif.woff'),
    bold: fontUrl('DejaVuSerif-Bold.woff'),
    italics: fontUrl('DejaVuSerif-Italic.woff'),
    bolditalics: fontUrl('DejaVuSerif-BoldItalic.woff'),
  },
  Mono: {
    normal: fontUrl('DejaVuSansMono.woff'),
    bold: fontUrl('DejaVuSansMono-Bold.woff'),
    italics: fontUrl('DejaVuSansMono.woff'),
    bolditalics: fontUrl('DejaVuSansMono-Bold.woff'),
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let pdfMakePromise: Promise<any> | null = null
function loadPdfMake() {
  pdfMakePromise ??= import('pdfmake/build/pdfmake').then((m: any) => {
    const pdfMake = m.default ?? m
    // Only our own font files may be fetched; images are inlined beforehand.
    const origin = location.origin
    pdfMake.setUrlAccessPolicy((url: string) => url.startsWith(origin + '/'))
    return pdfMake
  })
  return pdfMakePromise
}

// ---- collect what needs async work ------------------------------------------

/** Every block of the tree, and every inline run in it. */
function walk(b: Block, onBlock: (b: Block) => void, onInline: (n: Inline) => void) {
  onBlock(b)
  const inlines = (ns: Inline[]) => {
    for (const n of ns) {
      onInline(n)
      if ('children' in n) inlines(n.children)
    }
  }
  inlines(b.inlines)
  for (const row of b.rows) for (const cell of row) inlines(cell)
  for (const c of b.children) walk(c, onBlock, onInline)
}

async function loadImage(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    // Re-encode to PNG: pdfmake only takes JPEG/PNG, and this also handles WebP/GIF/SVG.
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    return { dataUrl: canvas.toDataURL('image/png'), width: bitmap.width, height: bitmap.height }
  } catch {
    return null // CORS-blocked, offline, or not an image: the PDF shows the alt text
  }
}

/**
 * Build a real-text PDF of the markdown and download it straight away.
 * Heavy pieces load on first use only: pdfmake (~1 MB) on the first export,
 * MathJax (~1.5 MB) only when a document has display math.
 */
/** What an export produced, for the log. */
export interface ExportReport {
  name: string
  bytes: number
  /** Images that couldn't be fetched (the PDF shows their alt text). */
  missingImages: string[]
  /** Diagrams and display formulas that didn't render (shown as code / text). */
  failedDiagrams: number
  failedMath: number
}

export async function exportMarkdownToPdf(markdown: string, fileName: string, font: PdfFont = 'Sans'): Promise<ExportReport> {
  const doc = parse(markdown)

  const display = new Set<string>()
  const imageUrls = new Set<string>()
  const mermaid = new Set<string>()
  let hasInlineMath = false
  walk(
    doc,
    (b) => {
      if (isMermaid(b)) mermaid.add(blockText(b))
      if (b.type === 'math') display.add(blockText(b).trim())
    },
    (n) => {
      if (n.type === 'math') hasInlineMath = true
      if (n.type === 'image') imageUrls.add(n.src)
    },
  )

  const [pdfMake, texToSvg, inlineMath, images] = await Promise.all([
    loadPdfMake(),
    display.size ? import('./pdf/math').then((m) => m.texToSvg) : null,
    hasInlineMath ? import('./pdf/inlineMath').then((m) => m.texToUnicode) : (s: string) => s,
    Promise.all([...imageUrls].map(async (u) => [u, await loadImage(u)] as const)),
  ])

  const math = new Map<string, RenderedMath>()
  if (texToSvg) {
    for (const tex of display) {
      const r = texToSvg(tex, BASE_SIZE, '#1f2328')
      if (r) math.set(tex, r)
    }
  }

  // Code blocks take a faded version of the current look's code colour; Mermaid
  // diagrams use the same tint for their boxes, and the body font for labels.
  const codeTint = pdfCodeTint(getComputedStyle(document.documentElement).getPropertyValue('--paper-code-bg'))
  const diagrams = new Map<string, { svg: string; width: number; height: number }>()
  if (mermaid.size) {
    const { renderDiagramForPdf } = await import('./diagram')
    for (const src of mermaid) {
      const d = await renderDiagramForPdf(src, codeTint, FONTS[font].normal)
      if (d) diagrams.set(src, d)
    }
  }

  const assets: PdfAssets = {
    diagrams,
    math,
    images: new Map(images.filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])),
    inlineMath,
  }
  const name = pdfName(fileName)
  const def = buildDocument(doc, name.replace(/\.pdf$/, ''), assets, font, codeTint)
  // Register only the fonts this export uses, so the others are never downloaded.
  pdfMake.setFonts({ [font]: FONTS[font], Mono: FONTS.Mono })
  const blob: Blob = await pdfMake.createPdf(def).getBlob()
  downloadBlob(name, blob)
  return {
    name,
    bytes: blob.size,
    missingImages: images.filter((e) => !e[1]).map((e) => e[0]),
    failedDiagrams: mermaid.size - diagrams.size,
    failedMath: display.size - math.size,
  }
}
