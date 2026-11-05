# Components

- `Workspace.vue` — editor + preview panes for the active tab; collapse rails, draggable divider, scroll sync
- `TabBar.vue` — one tab per open file (amber ● unsaved, ⚠ needs reconnect, italic = not linked yet)
- `HelpModal.vue` — renders `docs/concepts/*.md`
- `ui/UiButton.vue` — the app's button (sizes compact / regular / large; tones neutral, primary, ok, attention, danger)

Logic lives in `src/lib/` (`useTabs.ts`, `fileAccess.ts`, `markdown.ts`, `exportPdf.ts`); keep components thin.
