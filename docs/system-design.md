# System Design — Architecture & Patterns

Developer-facing documentation of how the app is structured, how data flows, and design decisions.

## §1 — System Overview

This is a Vue 3 + TypeScript + Vite single-page app (SPA) that works as a progressive web app (PWA). It provides:

- **Header/footer shell** — app title, Help modal, build/version info, reload affordance, debug panel
- **Service-worker caching** — offline capability, smart update detection
- **Mobile-first UX** — responsive, touch-optimized, no hover-only interactions
- **Pure computation layer** (`src/lib/`) — reusable logic separated from UI
- **Hot reload in dev** — instant feedback on code changes
- **Netlify** — production site and a live preview on every branch/PR, one host

### Architecture Diagram

```
┌─────────────────────────────────────────┐
│           Browser (PWA)                 │
│  ┌───────────────────────────────────┐  │
│  │  Service Worker (cache, updates)  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  App.vue (header/footer shell)    │  │
│  │  ├─ HelpModal                     │  │
│  │  ├─ DebugPanel                    │  │
│  │  ├─ UpdateAvailablePrompt         │  │
│  │  ├─ TabBar                        │  │
│  │  └─ Workspace (editor | preview)  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  lib/                             │  │
│  │  ├─ useTabs (store + IndexedDB)   │  │
│  │  ├─ fileAccess (FS Access API)    │  │
│  │  ├─ markdown (marked+DOMPurify)   │  │
│  │  └─ exportPdf → pdf/ (pdfmake)    │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  Local files on the user's disk   │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## §1b — Files, tabs and persistence

- **Tab** = `{ id, name, handle, content, saved, lastModified, access }`. Dirty = `content !== saved`.
- **access:** `linked` (handle + permission: Save writes in place), `needs-access` (handle restored
  after reload; the browser wants a click → Reconnect banner → `requestPermission`), `unlinked`
  (new tab, a file that vanished from disk, or a browser without the API).
- **Persistence:** the whole tab list (handles included — they're structured-cloneable) is written
  to IndexedDB (`idb-keyval`, key `md-editor:tabs`) 300 ms after any change. Pane layout is a
  per-viewer convenience in `localStorage` (`md-editor:layout`).
- **Disk refresh:** on restore, on tab activation and on window focus, linked tabs re-read their
  file. A clean tab follows the disk; a dirty tab keeps the draft and compares against the new
  disk text.
- **Save:** linked → `createWritable()`; unlinked → `showSaveFilePicker` (links the tab); no API →
  download.
- **Math:** `marked-katex-extension` (standard mode) runs inside the shared `marked` instance in
  `lib/markdownParser.ts`; KaTeX's HTML+MathML output passes DOMPurify unchanged in the preview.

## §1c — PDF export (direct download, real text)

```
markdown ─ lexMarkdown() ─▶ tokens ─┬─ walk: display math, images, inline math?
                                    ├─ MathJax tex→SVG (lazy, only if $$)     ┐
                                    ├─ fetch images → PNG data URLs (CORS)    ├─ PdfAssets
                                    └─ unicodeit for inline $…$ (lazy)        ┘
            buildDocument(tokens, title, assets)  ── pure, unit-tested ──▶ pdfmake doc
            pdfMake.createPdf(doc).getBlob()  ──▶ downloadBlob("name.pdf")
```

- **Layout** (`pdf/markdownToPdf.ts`): A4, margins 54/56/54/60 pt, DejaVu Sans 10.5 pt, line
  height 1.32. h1/h2 get a rule; a heading with nothing after it on its page moves to the next
  (`pageBreakBefore`). Code blocks and quotes are one-cell tables; checklists draw ☑/☐ instead
  of bullets; table rows don't split; page numbers in the footer when there's more than one page.
  pdfmake breaks pages between lines, so text is never cut.
- **Math:** display (`blockKatex`, and `$$…$$` inside a line, which the extension emits as an
  `inlineKatex` token with `displayMode`) → MathJax SVG with `fontCache: 'none'` (inline paths),
  `currentColor` replaced, sized from MathJax's ex units. Inline `$…$` → Unicode text via
  unicodeit (a pdfmake text run can't hold an image). Unrenderable TeX falls back to its source.
- **Fonts:** DejaVu subsets (Latin, Greek, Cyrillic, punctuation, arrows, math operators, shapes)
  as `.woff`, ~890 KB for six files, fetched by URL; `setUrlAccessPolicy` allows only our origin.
- **Loading:** pdfmake (~295 KB gz) on first export; MathJax (~600 KB gz) only for docs with
  display math. Neither is precached; a Workbox `CacheFirst` route (`pdf-export` cache) keeps
  them and the fonts after first use, so export works offline afterwards.
- **Cost:** a short doc exports in ~0.2 s; a long one using all five font styles ~1.5 s in the
  sandbox (font subsetting/embedding per export dominates).

## §2 — Header/Footer Wrapper Template

This is the shell that wraps every page/tab. It provides version checking, update affordances, Help modal, and debug logging. See `src/App.vue` for the full implementation.

### Key Features

1. **Header** — app title (centered), Help button (top-right), "Update available" button (top-left when new version detected)
2. **Footer** — build ID/timestamp (clickable to expand debug log), "Reload latest" button, version status
3. **Debug panel** — collapsible log of on-screen messages (no console on mobile)
4. **Help modal** — renders markdown docs from `docs/concepts/*.md`
5. **Update detection** — background check against live origin, prompts user when new build is available

### Version Checking Logic

- **Build identity.** `vite.config.ts` resolves a build id (`VITE_BUILD_ID`, else Netlify's
  `COMMIT_REF`, else `git rev-parse --short HEAD`, else `dev`), bakes it into the bundle as
  `__BUILD_ID__`/`__BUILD_TIME__`, and emits `version.json` (`{ commit, builtAt }`) into the build
  root. Workbox doesn't precache `.json`, so that file always comes from the origin.
- **`useVersionCheck()`** (`src/lib/useVersionCheck.ts`) fetches `version.json` with `no-store` on
  mount and every 60 s, and compares its `commit` to `__BUILD_ID__`. States: `current`,
  `update-ready`, `unknown` (no answer yet, offline, or `vite dev`, which has no `version.json`).
  Fetch failures are logged only when reachability changes.
- **Footer:** `build <id> · <time>`, then `· up to date` or `· <commit> is live`.
- **Header:** "Update available" shows when the status is `update-ready`; its popover lists the
  running build and the live one.
- **"Reload latest"** checks again first. If `current`, it says "Already on the latest build ✓" and
  stops. Otherwise it calls `reloadLatest()` from `src/pwa.ts`, which unregisters the service
  worker, deletes every Cache Storage entry, and `location.replace`s with `?fresh=<ts>` (stripped
  again in `main.ts`). A polite `updateServiceWorker(true)` + reload often replays the old bundle on
  iOS, which is why the manual path is heavy-handed. It also drops any runtime caches an app adds;
  an app that caches data for offline use should delete only Workbox's precache there.
- **Background updates:** `setupPWAUpdates()` (called from `App.vue`, since `useRegisterSW` is a
  composable) registers the worker, calls `reg.update()` every 60 s, and applies a new worker as
  soon as it's ready. That reload doesn't wait for the user — an app with unsaved state should
  prompt there instead.

### Styling

Buttons use one component, `UiButton.vue` (sizes tag/compact/regular/large), styled as **liquid glass**: each tone sets the hue (`--h/--s/--l`, `--fill`) the glass is lit with; layered inset box-shadows give the lit top edge and bottom glow, `::before` casts a glow below, `::after` is a light streak that sweeps on hover, `:active` sinks it. Text labels only — no emoji. The body background carries soft colour glows (fixed) so the glass has something to show. **`TabBar.vue`** is a liquid nav: the bar is a `div` with `backdrop-filter`, clipped by `clip-path: path()` to the dented shape from `dentPath()`, plus an SVG stroke for its lit edge; a glass bubble (pill, sized to the tab) carries the active tab. On a switch, two `Spring`s (centre, width) drive the bubble and dent per animation frame; each bar label's opacity/translate/scale come from `labelSink()` (smoothstep of distance), and the bubble's label rises in by arrival progress. Tabs scroll sideways when there are many; the track reserves room above the bar so the bubble is never clipped. Uses CSS custom properties (`--bg-elev`, `--text`, `--border`, etc.) for theming — a dark-only slate palette from power-gis (`src/styles/vars.css`). The inside of the editor/preview panes uses a separate **paper** layer — `--paper-*` tokens, dark by default, `.paper-light` on `Workspace.vue`'s root for the light page (toggle: `lib/usePaperTheme.ts`). Neither variant uses pure white. Rendered markdown uses `src/styles/markdown.css` (`.md-body` reads the paper tokens on screen; `.md-body.md-print` forces black-on-white for PDF). Mobile-safe padding with `safe-area-inset` for notch/bottom-bar devices.

## §3 — Data Layer (api/)

Where to put external data fetches. Example structure:

```
src/api/
  example.ts       fetch & cache logic
```

Keep fetches synchronous from the component's perspective using a composable (below) that caches results.

## §4 — Shared Logic (lib/)

Pure functions over already-fetched data. These recompute instantly, no refetch. Example:

```
src/lib/
  indicators.ts    e.g., moving average, Bollinger bands
  compute.ts       custom app logic
  utils.ts         helpers
```

Keep functions **pure** — same input → same output, no side effects.

## §5 — Composables

Vue reactive wrappers around data fetches. Example:

```typescript
// src/lib/useMyData.ts
export const useMyData = () => {
  const data = ref([])
  onMounted(async () => {
    data.value = await fetch(...)
  })
  return { data }
}
```

Use these in components to stay reactive without fetch boilerplate.

## §6 — Components

Organized by feature. Keep them thin — mostly templating, logic lives in `lib/` and composables.

```
src/components/
  HelpModal.vue      (provided)
  <FeatureA>.vue
  <FeatureB>.vue
```

## §7 — Build, Deploy & Conventions

**Local dev:** `npm run dev` (hot reload at http://localhost:5173)

**Build before commit:** `npm run build` (catches TS errors + template parse errors)

**Production and preview, both via Netlify** (see `netlify.toml`): `main` pushes build production; every other branch/PR gets its own Deploy Preview.

**PR build check:** `.github/workflows/ci.yml` runs `npm run build` on every PR — this is the `build` status check the branch ruleset requires. It doesn't deploy anything.

**Conventions:**
- Components: PascalCase, one per file
- Functions/vars: camelCase
- CSS: BEM or utility classes (avoid specificity wars)
- Types: keep in component file or `types/` folder

## §8 — PWA & Service Worker

`pwa.ts` handles:
- Service worker registration
- Auto-update on new deploys
- Offline detection
- Update available → reload prompt

`main.ts` bootstraps the Vue app + PWA setup.

Service worker is generated by Vite + `vite-plugin-pwa` (auto-configured).

## §9 — Glossary

- **SPA** — Single-Page App (no server-side rendering, runs entirely in the browser)
- **PWA** — Progressive Web App (works offline, installable like a native app)
- **Service Worker** — Background script that handles caching and network requests
- **Deploy Preview** — Netlify's term for a per-branch temporary deploy
- **Build ID** — Git commit SHA, shown in footer for debugging
- **Reload latest** — Force-refresh service worker cache and reload the page

---

**When you change architecture or add a major feature, update the relevant section above + the diagram.**
