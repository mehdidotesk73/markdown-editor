# TODO — Project Backlog

Track feature development, improvements, and known issues here. Move completed work to **Done**, queue new ideas under **Next**, and record blockers in **Blocked**.

## Done

### v0.1.0 — Markdown editor (2026-11-05)

Scaffolded from the netlify-webapp template and built the editor: tabs linked to local files
via the File System Access API (download fallback elsewhere), split editor/preview with
collapsible panes and a draggable divider, Save / Save as / Export PDF (html2pdf.js),
drafts + file handles persisted in IndexedDB, external-change pickup on focus, dark slate
theme from power-gis, Help modal now renders `docs/concepts/*.md`.

### v0.10.0 — More looks (2026-11-10)

Looks from the theme canvas are now in the app: Navy & Brass (the default dark, with a deeper
navy), Graphite and Midnight & Champagne (dark), Porcelain and Fog (light), all with the same
serif for titles and headings. Sage, Original, Smoke & Sand and Monochrome were tried and dropped. The
arrow beside Dark / Light opens them; Dark / Light flips between the chosen dark and light look.

### v0.9.0 — Lettered lists, PDF font, softer code blocks (2026-11-10)

Lines starting `a)` `b)` (or `A.` `B.`) now render as lettered lists in the preview and the PDF.
The PDF's body font is chosen from a menu beside Export PDF (Sans, Serif, Mono) and remembered.
Code blocks in the PDF sit on a soft cream panel (long lines wrap; long blocks continue across pages).

### v0.8.0 — Block indent, Focus dropdown (2026-11-09)

Tab and Shift+Tab indent and outdent every line a selection touches (no selection: Tab inserts
an indent, Shift+Tab outdents the line), as one undoable step. The focus controls became a
**Focus** button at the top right of the Preview header — the eye shows on/off — that drops down
the settings panel. The focus now starts off, with the panel closed.

### v0.7.0 — Focus as a share of attention (2026-11-07)

The focus engine now follows the user's model: a focal point emits a bell-shaped attention field
whose decay (in words) is tuned per scale; each unit's attention is the field's average over it;
the units holding 60% of the cumulative attention are in focus and underlined. Lag makes the
focus follow the cursor's path that many units behind. A counter shows how many units are in focus. The nested ruler and
the fixed cut-off are gone.

Default decays tuned by the user in the app: words 1, sentences 12, paragraphs 30 (sections 150,
not yet tuned).

### v0.6.0 — Compact matte buttons with Lucide icons (2026-11-07)

Every `UiButton` is now compact and matte: a flat solid fill, a hairline border and small rounded
corners, with no gradients, blur, glow or sheen. The main action and toggles that are on get a
solid fill (pale sage in Sage, dark ink in Porcelain). Colours are `--btn-*` tokens per theme.
The tab bar matches: a flat bar with a hairline border, and a flat fill under the active tab
that still springs between tabs. The focus panel's dropdowns use the same tokens.
Buttons carry Lucide icons (`@lucide/vue`): an icon on the left, on the right, a label, or any mix.

### v0.5.0 — Focus shadow (2026-11-07)

A focus engine (`src/lib/focus/`): `buildIndex` segments the source into words, sentences,
paragraphs and sections on a shared word ruler; `focusSpan` scores units by their average
peak-1 bell value (σ = intensity in words; linear or nested rulers) and returns the contiguous
span above a fixed 0.4 cut-off; `Shadow` trails the cursor on a leash; `alignWords` maps source
words to the preview. `useFocusShadow` underlines the shadow's span in the preview with the CSS
Custom Highlight API. Controls under the Preview header (`FocusControls.vue`). 17 unit tests.
`docs/focus-shadow-showcase.md`: a guide to the model, laid out to demo every effect. New documents
(＋, New file, Ctrl/⌘+Alt+N — one path, `newDocument()`) open prefilled with it.

### v0.4.0 — Sage & Porcelain themes, liquid-glass buttons and tabs (2026-11-06)

Whole-app themes chosen from a canvas of nine sketches: Dark = Sage, Light = Porcelain
(`src/styles/vars.css`; `useTheme` in `src/lib/useTheme.ts` replaces the panel-only toggle).
Porcelain adds a dot-grid page, frosted white glass, an ink-pill main action and Fraunces
headings (`@fontsource/fraunces`).


Every button uses the shared `UiButton` (since restyled compact and matte), first styled as hue-lit liquid glass (layered inner
light, glow below, hover light sweep, press sink), including the formerly hand-styled Update
available, popover reload and footer buttons (new `tag` size). Emoji icons removed — text
labels only. The tab bar is a liquid nav: a clear glass pill where the active tab sits in a deep
well pressed into the glass, springing to the next tab; names light up by distance
(`labelSink`, `Spring` in `src/lib/liquidTabs.ts`, 3 tests).
Main-action buttons are deep, background-coloured glass (`--liquid-deep`); all light on the glass is warm off-white (`--liquid-white`, `--liquid-light`); no accent hue in the glass, amber only as the small ● mark.

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

- Focus: hand the shadow's `frame` (span text + scores) to an AI agent — debounce until the shadow settles, cache by text hash
- Focus: incremental index updates (re-segment only the edited block) for very large documents

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
