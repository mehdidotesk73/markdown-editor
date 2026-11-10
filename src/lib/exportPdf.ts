import type { Token, Tokens } from 'marked'
import { lexMarkdown } from './markdownParser'
import { buildDocument, isDisplayInline, pdfCodeTint, BASE_SIZE, type PdfAssets, type PdfFont, type RenderedMath } from './pdf/markdownToPdf'
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

function walk(tokens: Token[], visit: (t: Token) => void) {
  for (const t of tokens) {
    visit(t)
    const anyT = t as any
    if (Array.isArray(anyT.tokens)) walk(anyT.tokens, visit)
    if (t.type === 'list') for (const item of (t as Tokens.List).items) walk(item.tokens, visit)
    if (t.type === 'table') {
      const tb = t as Tokens.Table
      for (const c of tb.header) walk(c.tokens, visit)
      for (const r of tb.rows) for (const c of r) walk(c.tokens, visit)
    }
  }
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

const textarea = document.createElement('textarea')
function decode(s: string): string {
  if (!s.includes('&')) return s
  textarea.innerHTML = s
  return textarea.value
}

/**
 * Build a real-text PDF of the markdown and download it straight away.
 * Heavy pieces load on first use only: pdfmake (~1 MB) on the first export,
 * MathJax (~1.5 MB) only when a document has display math.
 */
export async function exportMarkdownToPdf(markdown: string, fileName: string, font: PdfFont = 'Sans'): Promise<void> {
  const tokens = lexMarkdown(markdown)

  const display = new Set<string>()
  const imageUrls = new Set<string>()
  let hasInlineMath = false
  walk(tokens, (t) => {
    if (t.type === 'blockKatex' || isDisplayInline(t)) display.add((t as any).text)
    else if (t.type === 'inlineKatex') hasInlineMath = true
    if (t.type === 'image') imageUrls.add((t as Tokens.Image).href)
  })

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

  const assets: PdfAssets = {
    math,
    images: new Map(images.filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])),
    inlineMath,
    decode,
  }
  const name = pdfName(fileName)
  // Code blocks take a faded version of the current look's code colour.
  const codeTint = pdfCodeTint(getComputedStyle(document.documentElement).getPropertyValue('--paper-code-bg'))
  const def = buildDocument(tokens, name.replace(/\.pdf$/, ''), assets, font, codeTint)
  // Register only the fonts this export uses, so the others are never downloaded.
  pdfMake.setFonts({ [font]: FONTS[font], Mono: FONTS.Mono })
  const blob: Blob = await pdfMake.createPdf(def).getBlob()
  downloadBlob(name, blob)
}
