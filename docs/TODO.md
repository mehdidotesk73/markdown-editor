# TODO — Project Backlog

Track feature development, improvements, and known issues here. Move completed work to **Done**, queue new ideas under **Next**, and record blockers in **Blocked**.

## Done

### v0.1.0 — Markdown editor (2026-11-05)

Scaffolded from the netlify-webapp template and built the editor: tabs linked to local files
via the File System Access API (download fallback elsewhere), split editor/preview with
collapsible panes and a draggable divider, Save / Save as / Export PDF (html2pdf.js),
drafts + file handles persisted in IndexedDB, external-change pickup on focus, dark slate
theme from power-gis, Help modal now renders `docs/concepts/*.md`.

### v0.4.0 — Liquid-glass buttons and tabs (2026-11-05)

Every button uses the shared `UiButton`, restyled as hue-lit liquid glass (layered inner
light, glow below, hover light sweep, press sink), including the formerly hand-styled Update
available, popover reload and footer buttons (new `tag` size). Emoji icons removed — text
labels only. The tab bar is a liquid nav: a clear glass pill where the active tab sits in a deep
well pressed into the glass, springing to the next tab; names light up by distance
(`labelSink`, `Spring` in `src/lib/liquidTabs.ts`, 3 tests).
Main-action buttons are deep, background-coloured glass lit with cool white (`--liquid-deep`, `--liquid-light`); no accent hue in the glass, amber only as the small ● mark.

### v0.3.0 — Export PDF downloads directly, as real text (2026-11-05)

No more print window: `exportMarkdownToPdf` builds the PDF with pdfmake and downloads it.
`buildDocument` in `src/lib/pdf/markdownToPdf.ts` maps the preview's `marked` tokens to a
pdfmake document; display math via MathJax SVG (`texToSvg`), inline math via Unicode
(`texToUnicode`); DejaVu fonts in `public/fonts`. First unit tests (Vitest, 19 tests on layout
and math), run in CI's `build` job.

### v0.2.0 — Clean PDF export, math, panel theme (2026-11-05)

Export PDF now goes through the browser's print engine (`exportMarkdownToPdf` in
`src/lib/exportPdf.ts`: hidden iframe + `print()`), replacing html2pdf — no more lines cut in
half at page breaks, text is selectable, ~1 MB lighter. LaTeX math via KaTeX
(`marked-katex-extension` in `src/lib/markdown.ts`). Light/Dark panel theme
(`src/lib/usePaperTheme.ts`, `--paper-*` tokens) with off-white tones in both modes.

## Next (Current Sprint)

One-time setup — tick these off as they're done:

- [x] Connect Netlify (finish-setup) — https://markdown-lab.netlify.app — required; gives previews AND the production site
- [x] Protect `main` (finish-setup) — required; this is what makes changes arrive as PRs with
      preview links, instead of going straight to the live site

- [ ] Verify on a real desktop Chrome: open → reload → Reconnect → save (can't be tested in the sandbox)

## Code

- Syntax highlighting in code blocks (preview + PDF)

## Docs

(Documentation gaps, missing help content, outdated instructions)

## UI / UX

(Design improvements, accessibility, mobile issues)

## DevOps / Build

(CI/CD, deployment, build process improvements)

## Known Issues

- Relative image paths (`./pic.png`) don't render — the page can't read the file's folder.
  Could be fixed by also asking for directory access (`showDirectoryPicker`).
- PDF: inline math is approximated as Unicode text (`$\frac{a}{b}$` → "(a)/(b)"); only display
  math is fully typeset. Web images whose host blocks cross-site requests (CORS) show their alt
  text instead. Very long unbroken words or code lines overflow rather than wrap.

## Ideas / Backlog (Low Priority)

- Open a whole folder as a sidebar of files
- PWA `file_handlers` so .md files can be opened from the OS straight into the installed app
- Light theme for the app chrome too (the panels already have one)
