import { replace } from 'unicodeit'

/**
 * Inline TeX → Unicode text for the PDF ("x^2" → "x²", "\alpha_1" → "α₁",
 * "T(e)\cap T(F)" → "T(e)∩ T(F)"). A PDF text run can't hold an image, so
 * inline formulas are approximated as text; display formulas get MathJax.
 */
export function texToUnicode(tex: string): string {
  return replace(
    tex
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\(left|right|bigl|bigr|Bigl|Bigr|big|Big)(?![a-zA-Z])/g, '')
      .replace(/\\[,;:! ]/g, ' '),
  )
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
