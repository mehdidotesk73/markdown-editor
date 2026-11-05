# CLAUDE.md

Guidance for any Claude session working in this repo. Read this first. The
repeatable procedures live in `.claude/skills/` — `finish-setup` for one-time
setup, `ship-feature` for every change after that.

## What this is

A Vue 3 + TypeScript + Vite single-page app (also a PWA), hosted on Netlify, that
edits **markdown files on the user's own computer**. Nothing is uploaded: the static site
runs in the browser and reads/writes local files through the File System Access API.

UI structure:

- **Top bar** — title, file actions (Open, Save, Save as…, Export PDF), panel theme
  toggle (Light/Dark), Help.
- **Tab bar** — one tab per open file; amber ● = unsaved, ⚠ = needs reconnecting, italic =
  not linked to a file yet; ＋ makes a new untitled tab.
- **Workspace** (`Workspace.vue`) — markdown source (left) and rendered preview (right),
  with a draggable divider. Either pane collapses to a thin rail: editor collapsed = read
  focus, preview collapsed = edit focus. Stacks vertically under 760 px.
- **Empty state** — Open a file / New file, shown when no tabs are open.

How files work (see `src/lib/fileAccess.ts`, `src/lib/useTabs.ts`):

- **Chromium (Chrome, Edge, Brave, Arc):** Open stores a `FileSystemFileHandle` per tab; Save
  writes straight back to that file. Handles + drafts persist in IndexedDB (`idb-keyval`), so
  tabs survive reloads. After a reload the browser usually needs one click (**Reconnect**
  banner) to grant access again. Linked files are re-read on window focus, so edits made in
  other apps show up (unless the tab has unsaved edits — then the draft wins).
- **Safari / Firefox / phones:** no File System Access API. Open uses a file input; Save
  downloads a copy. Drafts still persist in IndexedDB.
- **PDF export** downloads a real-text PDF built in the page with **pdfmake** — no print
  dialog. `src/lib/pdf/markdownToPdf.ts` turns the same `marked` tokens the preview uses into a
  pdfmake document (pure, unit-tested); `src/lib/exportPdf.ts` lazy-loads pdfmake, inlines
  images, renders display math and downloads. Fonts: DejaVu Sans / Sans Mono, subset to `.woff`
  in `public/fonts` (pdfmake can't read woff2), chosen because they cover arrows and math
  symbols. Display math → MathJax SVG (`lib/pdf/math.ts`, lazy, only for docs with `$$`); inline
  math → Unicode text (`lib/pdf/inlineMath.ts`), since a PDF text run can't hold an image.
  The user rejected both earlier approaches — don't go back to html2pdf (sliced screenshots)
  or the print dialog (extra step, serif fallback); see `docs/experience.md`.
- **Math:** KaTeX via `marked-katex-extension` in standard mode (`$x$`, `$$ … $$`; "$5 and
  $10" stays text). Its `.woff2` fonts are precached by Workbox for offline use.
- Markdown rendering: one shared parser, `src/lib/markdownParser.ts` (`marked` GFM + KaTeX,
  no DOM), → `DOMPurify` in `src/lib/markdown.ts` for the preview.

**Theme:** dark-only slate palette borrowed from `mehdidotesk73/power-gis` (`src/styles/vars.css`).
Accents have one job each — blue = interaction (links, focus), green = saved, amber = unsaved /
needs attention (always with a ● or ⚠ mark), red = errors. Liquid-glass palette (`--liquid-*` in `vars.css`, from the user's
reference navs): **smoky warm-neutral glass** with a bright white rim and milky light pooling at
the bottom for the tab bar and ordinary buttons; **teal-tinted clear glass with mint light inside and white text**
for the selected tab's bubble and the main action. The user rejected saturated blue (dated) and
pale aqua. Use tokens, never colour literals.
**Every button** goes through `components/ui/UiButton.vue` (sizes tag/compact/regular/large,
tones by job) — no hand-styled `<button>`s in the chrome. The look is **liquid glass**, and it
must stay **translucent**: a mostly clear body (backdrop blurs through; tone sets `--tint` and a
small `--body` alpha), a specular highlight across the top, a bright rim strongest on the top
edge, and light collected *inside* along the bottom edge (`--glow`). Plus a glow cast below
(`::before`), a light streak sweeping across on hover (`::after`), and a slight sink when pressed.
Opaque fills are what made earlier passes look flat. **No emoji icons** (they render as
pictures and break the glass): button labels are text; `icon` is only for plain Unicode marks
(⇤ ⇥ ● ✓ ✕).

**Tab bar (`TabBar.vue`) is a liquid nav:** a clear glass bar drawn as an SVG path whose top edge
flows into a smooth valley (S-curves into a gentle floor, like liquid displaced) under the active
tab's teal glass bubble, which rides mostly above the bar. Tabs are spaced from
`dentSpread()` so neighbours clear the valley; the bubble is sized from hidden measuring copies of
its (bolder) label. Switching tabs springs the bubble (and the dent)
to the new tab; each name in the bar sinks and fades in proportion to the bubble's distance, and
the bubble's own label rises in as it arrives. Geometry + spring live in `src/lib/liquidTabs.ts`
(`dentGeometry`, `dentPath`, `dentSpread`, `labelSink`, `Spring`; unit-tested). Respects `prefers-reduced-motion`.

**Panel ("paper") theme:** the inside of the editor and preview panes uses its own
`--paper-*` tokens (`vars.css`): dark by default, `.paper-light` swaps in a warm light page.
Neither uses pure white text or background — the user asked for off-white on both. Toggle state
lives in `src/lib/usePaperTheme.ts` (localStorage). `.md-body` reads `--paper-*`, so the Help
modal follows the dark default.

The app is wrapped in the template's header/footer shell. The top bar carries the Help button (renders `docs/concepts/*.md`) and an "Update available" affordance when a newer PWA build is live — a background update never auto-reloads while a tab has unsaved edits. The footer provides the current build id/timestamp, version-check status against the live origin, a "Reload latest" button to force-refresh a stale cache, and a collapsible debug log with copy-to-clipboard support. See `docs/system-design.md` §2 for the full wrapper template and implementation details.

The editor is **desktop-first** (local file access only works in desktop Chromium), but the layout must still work on a phone — see Debugging below for the no-console workflow.

## Getting Started

**Setup not finished?** Check the checklist under **Next** in `docs/TODO.md`. If
anything there is unticked, run the **`finish-setup`** skill — it's resumable and
does only what's outstanding.

**Ready to build?** Every change goes through **`ship-feature`**. See below.

## Development lifecycle

Every change — feature, fix, or tweak — goes through the **`ship-feature`** skill
(`.claude/skills/ship-feature/SKILL.md`): branch off `main`, build before each
commit, push, wait for the Netlify preview, run the pre-merge doc gate, open the
PR, hand the user preview + live + merge links, then watch the production deploy
after they merge.

Two rules that hold regardless:

- **Never work on `main`.** It's protected; pushes are rejected. If you find
  yourself on it, branch before doing anything.
- **The user merges, not you.** They can't merge what they can't find, so a PR
  turn always ends with the links.

**The skills in `.claude/skills/` are a copy, not a subscription.** This project
was scaffolded from a template by file copy, so fixes made to that template since
never arrive on their own. The **`update-skills`** skill pulls them in. Worth
offering when a step in setup or shipping goes wrong in a way that sounds like a
known bug — but don't run it mid-feature; it's housekeeping, not a fix for
whatever they're actually asking about.

## Build & verify

- **Type-check + build:** `npm run build` (runs `vue-tsc -b && vite build`).
  This is the gate — it catches TS errors _and_ Vue template parse errors.
  **Run it before every commit.** A broken build has reached history before
  because nothing ran it; don't let that happen.
- **CI runs the same build on every PR** (`.github/workflows/ci.yml`, check name `build`), and the
  branch ruleset requires it to pass before merge. That's a backstop, not a substitute: run
  `npm run build` locally before pushing rather than letting CI find it — a red check on the user's
  PR is noise they have to interpret.
- **Unit tests:** `npm test` (Vitest 3, node environment), `*.test.ts` beside the code. Today they
  cover the PDF converter's layout rules and math handling. Keep tested logic DOM-free (that's why
  the parser lives in `markdownParser.ts`, apart from DOMPurify and the KaTeX CSS). Add tests when
  a change adds logic later features will sit on (`ship-feature` step 4).
- **If tests exist, they run inside the `build` job** — one `npm test` line in
  `.github/workflows/ci.yml`, never a separate job. The ruleset requires a check named `build`; a
  second job called `test` would fail without blocking anything, since the ruleset isn't watching
  it.
- **No external data dependencies** — the app is self-contained. It can be driven end-to-end
  with Playwright against `npm run preview`: stub `window.showOpenFilePicker` /
  `showSaveFilePicker` to return OPFS handles (`navigator.storage.getDirectory()`), which are
  real `FileSystemFileHandle`s. Caveat: headless Chromium here crashes the page when an OPFS
  handle is read back out of IndexedDB, so the reload/reconnect path for *linked* tabs can't be
  tested in the sandbox — verify it on the user's machine.

## Deploys

- **Netlify does both jobs** (`netlify.toml`): pushes to `main` build the **production** site at
  `https://markdown-lab.netlify.app`; every other branch/PR gets its own **Deploy Preview**
  at `deploy-preview-<n>--markdown-lab.netlify.app`. One host, one build pipeline — nothing
  else to configure for hosting.
- **`.github/workflows/ci.yml` only runs the build check on PRs** — it doesn't deploy anything. Its
  sole job is the `build` status check the branch ruleset requires (see Build & verify).
- **`package-lock.json` is committed and must stay that way** — CI runs
  `npm ci`, which fails outright without a lockfile in sync with
  `package.json`. Commit the lockfile whenever you change dependencies.

## Repo structure

```
src/
  App.vue                  shell: top bar (file actions), tab bar, workspace, empty state, footer
  main.ts, pwa.ts          bootstrap; service-worker auto-update (held while edits are unsaved)
  debug.ts                 on-screen log: auto-captures errors + logDebug() (mobile has no console)
  env.d.ts                 ambient types: vite/client, PWA virtual module, __BUILD_ID__/__BUILD_TIME__
  lib/
    fileAccess.ts          File System Access API + fallbacks (file input / download)
    useTabs.ts             tab store: open/new/save/close, IndexedDB persistence, disk refresh
    markdownParser.ts      the shared marked instance (GFM + KaTeX), DOM-free
    markdown.ts            preview HTML: parser + DOMPurify
    exportPdf.ts           PDF export: lazy pdfmake, images, math → download
    pdf/markdownToPdf.ts   tokens → pdfmake document (pure; *.test.ts beside it)
    pdf/math.ts            display TeX → SVG via MathJax (lazy chunk)
    pdf/inlineMath.ts      inline TeX → Unicode text
    usePaperTheme.ts       Light/Dark panel theme (localStorage)
    liquidTabs.ts          tab bar geometry (dent path), label sink, spring (pure; tested)
    useVersionCheck.ts     compares the running build with the live one
  components/
    Workspace.vue          editor + preview panes, collapse rails, draggable divider, scroll sync
    TabBar.vue             liquid-glass tab bar: dented glass bar + springing bubble
    HelpModal.vue          renders docs/concepts/*.md into the Help modal
    ui/UiButton.vue        the app's button (sizes + tones)
  styles/
    vars.css               theme tokens (dark slate, from power-gis) + --paper-* panel tokens
    markdown.css           rendered-markdown styles (.md-body) for preview + Help
.claude/skills/            finish-setup, ship-feature, add-github-pages, add-statefulness,
                           add-database, update-skills, share-pattern
docs/
  TODO.md                  living backlog (Done / Next / Housekeeping)
  experience.md            what didn't work + per-merge version history
  system-design.md         developer/system docs (§2 has wrapper template)
  concepts/*.md            user docs (rendered into the Help modal)
public/
  favicon.svg, logo-192.png, logo-512.png   app icon (M↓ on slate)
  fonts/                   DejaVu .woff subsets for the PDF export (+ license)
.github/workflows/ci.yml       build check on every PR (required by the branch ruleset)
netlify.toml                   Netlify build + SPA redirect
package-lock.json              committed — CI runs `npm ci` and needs it
```

## Conventions & gotchas

- **Pure logic lives in `src/lib/`** as plain functions over the already-fetched
  data — they recompute instantly with no refetch. Keep new computation there and
  keep components thin.
- **Never lose text.** Every tab's draft is persisted to IndexedDB on change; closing a dirty
  tab confirms; `beforeunload` warns while anything is unsaved; background PWA updates wait.
- **Rendered HTML is always sanitized** (`renderMarkdown`) before `v-html`.
- **Desktop-first, phone-safe:** keep controls tappable and the stacked layout working.

## Debugging on device (no console)

- **Errors are captured automatically.** `installErrorCapture(app)` in
  `main.ts` routes four sources into the on-screen log: Vue's
  `errorHandler` (throws inside event handlers, hooks and watchers — the
  "button does nothing" case), `console.error`/`console.warn`, `window.error`
  (including failed resource loads), and `unhandledrejection`. Nobody has to
  have anticipated the failure for it to be visible.
- The footer shows **View logs** with a red count badge when errors exist;
  the panel has **Copy log**, which includes build id, user agent and URL.
  **Ask for it by name** — "tap View logs, then Copy log, and paste it here"
  — rather than asking what they see. Repeated identical errors collapse to
  `×N`, so a handler firing every tap can't flush the buffer.
- `logDebug(msg, kind?)` still exists for deliberate diagnostics. When
  something's invisible on device, add a **one-shot, guarded** one (in
  `onMounted`, wrapped in try/catch) and ask for the log. Remove or quiet
  noisy logs before merge.

## Reference docs

- `.claude/skills/finish-setup/SKILL.md` — scaffold personalization + one-time hosting setup (resumable).
- `.claude/skills/ship-feature/SKILL.md` — the loop for every change.
- `.claude/skills/add-github-pages/SKILL.md` — optional Netlify-independent mirror, on request.
- `docs/TODO.md` — current backlog and what's been done.
- `docs/experience.md` — dead ends (with reasons) + version history.
- `docs/system-design.md` — developer/system documentation; §2 contains the wrapper template.
- `docs/concepts/*.md` — per-page user docs, also rendered into the Help modal.
