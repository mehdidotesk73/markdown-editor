import { ref, watch } from 'vue'
import type { PdfFont } from './pdf/markdownToPdf'

// The PDF export's body font, chosen from the menu beside Export PDF.
// A per-viewer preference, so localStorage is fine.

const KEY = 'md-editor:pdf-font'
export const PDF_FONTS: { value: PdfFont; label: string; css: string }[] = [
  { value: 'Sans', label: 'Sans', css: 'system-ui, sans-serif' },
  { value: 'Serif', label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  { value: 'Mono', label: 'Mono', css: 'ui-monospace, Menlo, Consolas, monospace' },
]

function load(): PdfFont {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'Sans' || v === 'Serif' || v === 'Mono') return v
  } catch {
    /* storage blocked */
  }
  return 'Sans'
}

export const pdfFont = ref<PdfFont>(load())

watch(pdfFont, (v) => {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    /* storage blocked */
  }
})
