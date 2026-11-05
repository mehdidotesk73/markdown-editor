# TODO — Project Backlog

Track feature development, improvements, and known issues here. Move completed work to **Done**, queue new ideas under **Next**, and record blockers in **Blocked**.

## Done

### v0.1.0 — Markdown editor (2026-11-05)

Scaffolded from the netlify-webapp template and built the editor: tabs linked to local files
via the File System Access API (download fallback elsewhere), split editor/preview with
collapsible panes and a draggable divider, Save / Save as / Export PDF (html2pdf.js),
drafts + file handles persisted in IndexedDB, external-change pickup on focus, dark slate
theme from power-gis, Help modal now renders `docs/concepts/*.md`.

## Next (Current Sprint)

One-time setup — tick these off as they're done:

- [x] Connect Netlify (finish-setup) — https://markdown-lab.netlify.app — required; gives previews AND the production site
- [ ] Protect `main` (finish-setup) — required; this is what makes changes arrive as PRs with
      preview links, instead of going straight to the live site

- [ ] Verify on a real desktop Chrome: open → reload → Reconnect → save (can't be tested in the sandbox)

## Code

- Offer a vector (selectable-text) PDF option via the browser's print dialog
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
- PDF pages are images (html2canvas), so text in the PDF isn't selectable.

## Ideas / Backlog (Low Priority)

- Open a whole folder as a sidebar of files
- PWA `file_handlers` so .md files can be opened from the OS straight into the installed app
- Light theme toggle
