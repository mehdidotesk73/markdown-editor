import { renderMarkdown } from './markdown'

/** "notes.md" → "notes" (the browser adds .pdf) */
export function pdfTitle(name: string): string {
  return name.replace(/\.(md|markdown|mdx|txt)$/i, '')
}

/**
 * Export via the browser's own print engine: the rendered markdown goes into
 * a hidden iframe and its print dialog opens, where "Save as PDF" writes the
 * file. Unlike a screenshot-based PDF, pages break between lines (never
 * through them), text stays real and selectable, and math stays sharp.
 *
 * The iframe reuses the app's own stylesheets (markdown + KaTeX), and
 * `.md-print` forces black-on-white whatever the panel theme.
 */
export async function exportMarkdownToPdf(markdown: string, fileName: string): Promise<void> {
  const title = pdfTitle(fileName)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)

  try {
    const doc = frame.contentDocument!
    doc.open()
    doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
    doc.close()
    doc.title = title
    // Resolve the app's relative asset URLs (CSS, KaTeX fonts) from here.
    const base = doc.createElement('base')
    base.href = location.href
    doc.head.appendChild(base)

    // Same CSS as the app (Vite bundles markdown.css + KaTeX into these).
    const loads: Promise<unknown>[] = []
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
      const copy = doc.importNode(node, true) as HTMLElement
      if (copy instanceof HTMLLinkElement) {
        loads.push(
          new Promise((done) => {
            copy.addEventListener('load', done)
            copy.addEventListener('error', done)
            setTimeout(done, 3000) // never hang the export on one stylesheet
          }),
        )
      }
      doc.head.appendChild(copy)
    }
    const page = doc.createElement('style')
    page.textContent = `
      @page { size: A4; margin: 16mm 15mm; }
      :root { color-scheme: light; background: #ffffff !important; }
      html, body { background: #ffffff !important; margin: 0; padding: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `
    doc.head.appendChild(page)

    const article = doc.createElement('article')
    article.className = 'md-body md-print'
    article.innerHTML = renderMarkdown(markdown)
    doc.body.appendChild(article)

    await Promise.all(loads)
    await doc.fonts?.ready

    // Chrome names the PDF after the top-level page title.
    const appTitle = document.title
    document.title = title
    try {
      frame.contentWindow!.focus()
      frame.contentWindow!.print() // blocks until the dialog closes
    } finally {
      document.title = appTitle
    }
  } finally {
    // Some browsers return from print() before printing; give them a moment.
    setTimeout(() => frame.remove(), 1000)
  }
}
