// TeX → SVG for the PDF, with MathJax (KaTeX, used by the preview, only
// outputs HTML, which a PDF can't embed). Lazy-loaded: only documents that
// contain display math pay for it. Glyphs come out as paths, so no math fonts
// are needed in the PDF.
import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
// The packages KaTeX users rely on, not MathJax's whole catalogue (halves the chunk).
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js'
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js'
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js'
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js'
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js'
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js'
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js'
import 'mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js'
import 'mathjax-full/js/input/tex/braket/BraketConfiguration.js'
import 'mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js'
const PACKAGES = ['base', 'ams', 'newcommand', 'noundefined', 'boldsymbol', 'cancel', 'color', 'mathtools', 'braket', 'textmacros']
import type { RenderedMath } from './markdownToPdf'

const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: PACKAGES }),
  OutputJax: new SVG({ fontCache: 'none' }), // inline paths: no <use> refs for the PDF to resolve
})

/** Display-mode TeX → SVG sized in points for a body font of `fontSizePt`. */
export function texToSvg(tex: string, fontSizePt: number, color: string): RenderedMath | null {
  try {
    const node = doc.convert(tex, { display: true, em: 16, ex: 8, containerWidth: 80 * 16 })
    let svg = adaptor.innerHTML(node)
    // MathJax reports a TeX error inside the SVG instead of throwing.
    if (svg.includes('data-mjx-error')) return null
    // Sizes are in ex; MathJax's ex is half an em. Scale a touch up for display math.
    const ex = (fontSizePt / 2) * 1.12
    const w = parseFloat(/width="([\d.]+)ex"/.exec(svg)?.[1] ?? '0') * ex
    const h = parseFloat(/height="([\d.]+)ex"/.exec(svg)?.[1] ?? '0') * ex
    if (!w || !h) return null
    svg = svg.replace(/currentColor/g, color).replace(/style="[^"]*"/, '')
    return { svg, width: w, height: h }
  } catch {
    return null
  }
}
