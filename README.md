# Markdown Editor

A simple markdown editor for **files on your own computer**, hosted as a static site on
Netlify at **https://markdown-lab.netlify.app**. Open a local `.md` file, write on the left, see it rendered on the right, and
**Save** writes straight back to the file. Nothing is uploaded anywhere.

## Features

- **Link a local file** — Open picks a file on your computer; Save writes to it in place.
- **Tabs** — each tab points to its own local file. Amber ● = unsaved changes.
- **Split view** — markdown source on the left, live preview on the right, draggable divider.
- **Focus modes** — collapse the editor for read focus, or the preview for edit focus.
- **Export PDF** — opens the print window; choose **Save as PDF**. Pages break cleanly and
  the text stays selectable.
- **Math** — LaTeX via KaTeX: `$x^2$` inline, `$$ … $$` for display formulas.
- **Panel theme** — Light or Dark paper inside the editor and preview (off-white, never
  pure white); the rest of the app stays dark.
- **Nothing lost** — tabs and unsaved drafts survive reloads; the app warns before
  closing a tab or the window with unsaved edits.
- Picks up changes made to the file in other apps when you switch back to the editor.
- Works offline once loaded (PWA).

Shortcuts: `Ctrl/⌘ S` save · `Ctrl/⌘ ⇧ S` save as · `Ctrl/⌘ O` open · `Ctrl/⌘ P` export
PDF · `Ctrl/⌘ \` toggle editor · `Ctrl/⌘ ⇧ \` toggle preview · `Ctrl/⌘ Alt N` new tab.

## Browser support

Saving **in place** needs the File System Access API: **Chrome, Edge, Brave, Arc, Opera**
on desktop. In Safari, Firefox and on phones the editor still works, but Save downloads a
copy of the file instead of overwriting it.

After a reload the browser asks once per file to allow access again — click **Reconnect**
on the banner.

## Development

Built with Vue 3 + TypeScript + Vite (PWA), `marked` + `DOMPurify` for rendering,
KaTeX for math, the browser's print engine for PDF export, `idb-keyval` for storing tabs.

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build (the CI gate)
```

## Hosting

Netlify builds `main` as the production site (https://markdown-lab.netlify.app) and every
pull request as a Deploy Preview at `deploy-preview-<n>--markdown-lab.netlify.app`
(`netlify.toml`). CI (`.github/workflows/ci.yml`) runs the build on every PR.

## Docs

- [`CLAUDE.md`](CLAUDE.md) — how the project is put together, for Claude sessions
- [`docs/system-design.md`](docs/system-design.md) — system design
- [`docs/concepts/overview.md`](docs/concepts/overview.md) — user help (also shown in the app's Help)
- [`docs/TODO.md`](docs/TODO.md) — backlog
- [`docs/experience.md`](docs/experience.md) — lessons learned + version history

Scaffolded from [claude-nocode-netlify-webapp-workflow](https://github.com/mehdidotesk73/claude-nocode-netlify-webapp-workflow);
colour theme from [power-gis](https://github.com/mehdidotesk73/power-gis).
