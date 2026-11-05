import { renderMarkdown } from './markdown'

/** "notes.md" → "notes.pdf" */
export function pdfName(name: string): string {
  return name.replace(/\.(md|markdown|mdx|txt)$/i, '') + '.pdf'
}

/**
 * Render markdown to a PDF and download it. Always black-on-white (the
 * `.md-print` styles in styles/markdown.css), whatever the on-screen theme.
 * html2pdf is ~1 MB, so it's loaded only the first time someone exports.
 */
export async function exportMarkdownToPdf(markdown: string, fileName: string): Promise<void> {
  const { default: html2pdf } = await import('html2pdf.js')

  const el = document.createElement('article')
  el.className = 'md-body md-print'
  el.style.width = '180mm' // A4 (210mm) minus 15mm margins
  el.innerHTML = renderMarkdown(markdown)

  const options = {
    margin: [15, 15, 15, 15] as [number, number, number, number],
    filename: pdfName(fileName),
    image: { type: 'jpeg' as const, quality: 0.96 },
    enableLinks: true,
    html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['pre', 'blockquote', 'table', 'img', 'tr'] },
  }
  await html2pdf().set(options).from(el).save()
}
