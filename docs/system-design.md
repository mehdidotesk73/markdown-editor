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
- **Body font** (`lib/pdfFont.ts`, localStorage `md-editor:pdf-font`): Sans / Serif / Mono, picked from
  the menu beside Export PDF; `buildDocument(…, font)` sets `defaultStyle.font`, code stays Mono. Each
  export calls `pdfMake.setFonts` with only that font + Mono, so unused faces are never downloaded.
- **Code blocks:** a one-cell table, fill `#f5f5f2`, 0.4pt `#e4e4de` edge, 10/8pt padding (pdfmake
  tables can't round corners, and a drawn rounded box can't follow a block across a page break).
- **Lettered lists** (`lib/alphaList.ts`, a marked block extension): consecutive `a)`/`a.` (or `A)`/`A.`)
  lines starting at a/A and going up one letter at a time, at least two, become an ordinary ordered
  `list` token with `alpha: 'lower' | 'upper'`; the preview renders `<ol type="a|A">`, the PDF sets
  pdfmake's `type: 'lower-alpha' | 'upper-alpha'`. A lone "A. Lincoln…" line stays a paragraph.
- **Fonts:** DejaVu subsets (Latin, Greek, Cyrillic, punctuation, arrows, math operators, shapes)
  as `.woff`, ~890 KB for six files, fetched by URL; `setUrlAccessPolicy` allows only our origin.
- **Loading:** pdfmake (~295 KB gz) on first export; MathJax (~600 KB gz) only for docs with
  display math. Neither is precached; a Workbox `CacheFirst` route (`pdf-export` cache) keeps
  them and the fonts after first use, so export works offline afterwards.
- **Cost:** a short doc exports in ~0.2 s; a long one using all five font styles ~1.5 s in the
  sandbox (font subsetting/embedding per export dominates).

## §1d — Focus engine (`src/lib/focus/`)

The analytical driver for features that follow the cursor. Pure modules (no DOM) plus one
browser-side composable. The model, in the user's terms: a **focal point** emits a bell-shaped
**attention field**; each unit's attention is the field's average over the unit; the **focus** is
the run of units holding 60% of the cumulative attention.

- **`segment.ts` — the index.** `buildIndex(text)` splits the source into blocks (paragraphs, list
  items, headings, table rows; fenced code is one block and one sentence), sections (at
  headings), sentences (`Intl.Segmenter`, inside each block) and words (`Intl.Segmenter`,
  word-like only). Each scale is a set of `Int32Array`s: character range and **word range
  [w0, w1)**. The shared ruler is the word: word *i* occupies [i, i+1); a sentence's length is
  its word count. Units with no words are dropped. `wordCoord(index, offset)` puts the cursor on
  the ruler (fractionally inside a word). ~30 ms per 10k words; ~330 ms for 100k.
- **`wave.ts` — attention and focus.** A peak-1 bell b(x) = exp(−(x−x₀)²/2σ²) on the word ruler,
  σ = the field's **decay** length in words. Every scale is laid on the same word ruler (there is
  no nested ruler any more). A unit's **attention** is the field's **average** over [w0, w1)
  (closed form via erf), so a unit gets less attention when it is farther *and* when it is
  longer; area under the curve was rejected because it gives long units *more* attention.
  `focusSpan(index, scale, x0, σ)` sums the attention of every unit within 8σ, then grows a
  contiguous run from the unit under x₀ (always included), each step taking the neighbour with
  more attention, until the run holds **`FOCUS_SHARE` = 60%** of the total. Returns the run's
  source/word ranges, each unit's attention and the share held. ~10 µs per call on the guide.
- **`focal.ts` — lag along the cursor path.** A `Trail` per scale records the last distinct units
  the cursor has been in (consecutive repeats collapse; each entry keeps the cursor's latest word
  position in that unit; up to `MAX_LAG` + 1 = 21 entries). `Trails` feeds every scale on each
  cursor update, so switching scale keeps its history. The focal point at lag L is the entry L
  steps back (the oldest entry if the trail is shorter); lag 0 is the cursor. It follows the
  path, not document order: a jump elsewhere is caught up with L steps later. Cleared on a tab
  switch.
- **`align.ts` — source → preview.** Greedy in-order word match (lookahead 60) between source
  words and rendered preview words. Every match must be **confirmed** by the next words lining up
  (2 of the next 6 source words), and words inside `$…$` / `$$…$$` are left out (the preview shows
  rendered math) — otherwise a stray formula letter or URL word matches far ahead and the rest of
  the document drifts. Markup-only words go unmatched.
- **Showcase:** `docs/focus-shadow-showcase.md` explains the model and is laid out (tiny vs long
  sentences, word lists, paragraph lists, nested sections) to exercise it. It is also the text a
  new document opens with.
- **`useFocusShadow.ts` — the browser side.** Follows the textarea's caret (key/click/select +
  `selectionchange`), rebuilds the index 150 ms after typing pauses and immediately on a tab
  switch (no per-tab state), re-aligns after each preview render, computes once per animation
  frame, and draws the focus with the **CSS Custom Highlight API** (`::highlight(focus-shadow)` in
  `markdown.css`) — no DOM changes. Each compute records the cursor in the trails. It exposes a `frame` (`cursorX`, `focalX`, `span` with each
  unit's attention, `count` of units in focus, the focus's source `text`): the hook for an AI
  pointer. The controls (`FocusControls.vue`) are a **Focus** button at the right of the Preview header — eye / crossed-out eye for on/off, label, chevron — that drops down a panel over the preview (positioned against `.preview-pane`) with the on/off eye toggle, scale, decay, lag and the live `count` ("3 sentences in focus"). The panel stays open until the button is clicked again (or Escape), so the user can tune while moving the cursor; on a narrow pane (container query) each slider gets its own full-width row.
- **Settings** (`settings.ts`, localStorage `md-editor:focus:v4`): enabled (default **off**), panel
  (default **closed**; independent of enabled), scale, **decay per scale** (σ in words; logarithmic slider with a range
  per scale — words 0.3–40, sentences 1–300, paragraphs 2–1000, sections 5–3000; defaults 1 / 12 /
  30 / 150, chosen by the user by trial), lag 0–20 units (default 0). The user tunes each
  scale's decay by trial in the app.

Superseded designs (see `docs/experience.md`): a fixed 0.4 cut-off on the average, an
"intensity" slider in words shared by all scales (1–60: useless above the sentence scale), a
nested ruler (paragraphs counted in sentences), and a leash distance in words.

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

Buttons use one component, `UiButton.vue` (sizes tag/compact/regular/large, all compact), styled **matte**: a flat solid fill (`--btn-bg`), a 1px border (`--btn-border`), `--btn-radius` corners, no gradients, blur or shadows; hover → `--btn-bg-hover` / `--btn-border-hover`, pressed → `--btn-bg-press`. The main action (`tone="primary"`) and toggles that are on (`active`) use `--btn-primary-*` (Sage: pale sage, dark text; Porcelain: dark ink). `--c` is the label colour and containers may set it (pane heads use `--paper-muted`). Icons: `iconLeft` / `iconRight` props, each a Lucide component (`@lucide/vue`) or a Unicode status-mark string (rendered as `.mark`); under `t-attention` the icon or mark turns amber (Save when unsaved, Reconnect); Lucide icons render as `.ic` at 1.2em with `stroke-width: var(--icon-stroke, 1.75)`. Label-less with one icon → `.square`. No emoji. **`TabBar.vue`** is matte too: the scroller is a flat bar (`--bg-elev`, `--btn-border` hairline). The active tab sits on a **well** — an absolutely positioned flat fill behind the names (`--btn-bg-hover`, `--btn-border-hover`, `--btn-radius`). On a switch, two `Spring`s (centre, width) move the well per animation frame; each tab gets `--lit` from `labelSink()` (smoothstep of distance), which drives its colour (muted → full `--text`). The ＋ is a small square matte button. Tabs scroll sideways when there are many. **Themes:** `src/styles/vars.css` holds two full token sets — Sage on `:root` (dark, default) and Porcelain on `:root[data-theme='light']` — covering surfaces, text, accents, shadows (`--shadow-rgb`, `--liquid-drop`), the page backdrop (`--bg-image`: sage glow / dot grid), panels (`--paper-*`), matte buttons and tab bar (`--btn-*`; the older `--liquid-*` glass tokens are now only used by the top bar's popover) and `--font-display` (Fraunces in Porcelain). `lib/useTheme.ts` sets `data-theme` on `<html>` at import, before first paint, and updates `<meta name=theme-color>`. Components never branch on the theme; they only read tokens. The editor/preview panes use the **paper** tokens (`--paper-*`), set by each theme; neither uses pure white. Rendered markdown uses `src/styles/markdown.css` (`.md-body` reads the paper tokens; h1–h3 take `--font-display`). The PDF export doesn't use these styles (`lib/pdf`). Mobile-safe padding with `safe-area-inset` for notch/bottom-bar devices.

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
