<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import HelpModal from './components/HelpModal.vue'
import TabBar from './components/TabBar.vue'
import Workspace from './components/Workspace.vue'
import UiButton from './components/ui/UiButton.vue'
import { debugState, logDebug, logAsText } from './debug'
import { setupPWAUpdates } from './pwa'
import { useVersionCheck } from './lib/useVersionCheck'
import { useTabs, isDirty } from './lib/useTabs'
import { supportsFileSystemAccess } from './lib/fileAccess'
import { exportMarkdownToPdf } from './lib/exportPdf'
import { usePaperTheme } from './lib/usePaperTheme'

const buildId = __BUILD_ID__
const buildTime = __BUILD_TIME__
const showDebug = ref(false)
const copied = ref(false)

const tabs = useTabs()
const { state, active, anyDirty } = tabs

// Never auto-reload onto a new build while a file has unsaved edits — the
// "Update available" button is still there for when the user is ready.
const { reloadLatest } = setupPWAUpdates(() => !anyDirty.value)

// Update available affordance: shown when the origin serves a different build
const { status: versionStatus, published, checkNow } = useVersionCheck()
const updateAvailable = computed(() => versionStatus.value === 'update-ready')
const showUpdatePanel = ref(false)
const updateSlot = ref<HTMLElement>()
const alreadyLatest = ref(false)

function onDocClickUpdate(e: MouseEvent) {
  if (showUpdatePanel.value && updateSlot.value && !updateSlot.value.contains(e.target as Node)) {
    showUpdatePanel.value = false
  }
}

const errorCount = computed(() => debugState.logs.filter((l) => l.kind === 'error').length)

// Copy the log so the user can paste it back to Claude.
async function copyLog() {
  const text = logAsText(buildId, buildTime)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length) // iOS ignores select() alone
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (!ok) {
      logDebug('Could not copy automatically — select the log text and copy it by hand.', 'warn')
      return
    }
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

async function onReloadLatest() {
  if ((await checkNow()) === 'current') {
    alreadyLatest.value = true
    setTimeout(() => (alreadyLatest.value = false), 2000)
    return
  }
  if (anyDirty.value && !confirm('Some files have unsaved changes. Reload anyway? (Drafts are kept.)')) return
  logDebug('Reloading to latest build...')
  await reloadLatest()
}

// ---- editor actions --------------------------------------------------------

const workspace = ref<InstanceType<typeof Workspace>>()
const exporting = ref(false)
const savedFlash = ref(false)

// The "Saved" flash belongs to the tab that was saved.
watch(
  () => state.activeId,
  () => (savedFlash.value = false),
)

const activeDirty = computed(() => (active.value ? isDirty(active.value) : false))
const saveLabel = computed(() => {
  if (!active.value) return 'Save'
  if (!supportsFileSystemAccess) return 'Download .md'
  return active.value.handle ? 'Save' : 'Save to file…'
})

async function onOpen() {
  try {
    await tabs.openFiles()
  } catch (e) {
    logDebug(`Could not open file: ${(e as Error).message}`, 'error')
  }
}

async function onSave(saveAs = false) {
  if (!active.value) return
  if (await tabs.save(active.value, saveAs)) {
    savedFlash.value = true
    setTimeout(() => (savedFlash.value = false), 1400)
  }
}

async function onExport() {
  if (!active.value || exporting.value) return
  exporting.value = true
  try {
    await exportMarkdownToPdf(active.value.content, active.value.name)
    logDebug(`Opened the print window for ${active.value.name}`)
  } catch (e) {
    logDebug(`PDF export failed: ${(e as Error).message}`, 'error')
  } finally {
    exporting.value = false
  }
}

// Ctrl/⌘+S save · ⇧ save as · O open · Alt+N new · P export ·
// Ctrl/⌘+\ toggles the editor, Ctrl/⌘+⇧+\ the preview.
function onKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  const k = e.key.toLowerCase()
  if (k === 's') {
    e.preventDefault()
    void onSave(e.shiftKey)
  } else if (k === 'o') {
    e.preventDefault()
    void onOpen()
  } else if (k === 'p' && active.value) {
    e.preventDefault()
    void onExport()
  } else if (e.altKey && k === 'n') {
    e.preventDefault()
    tabs.newTab()
  } else if (e.key === '\\' || e.code === 'Backslash') {
    e.preventDefault()
    if (e.shiftKey) workspace.value?.togglePreview()
    else workspace.value?.toggleEditor()
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (anyDirty.value) e.preventDefault()
}

// Pick up edits made to linked files in other apps when the user comes back.
function onFocus() {
  void tabs.refreshAll()
}

onMounted(() => {
  document.addEventListener('click', onDocClickUpdate)
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('focus', onFocus)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClickUpdate)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('focus', onFocus)
})

const { paper, togglePaper } = usePaperTheme()

const showHelp = ref(false)
const helpDoc = ref('overview')
</script>

<template>
  <main class="app">
    <header class="topbar">
      <div class="brand">
        <img src="/favicon.svg" alt="" class="logo" />
        <h1 class="app-title">Markdown Editor</h1>
      </div>

      <div v-if="active" class="toolbar" role="toolbar" aria-label="File actions">
        <UiButton size="compact" icon="📂" title="Open a local file (Ctrl/⌘+O)" @click="onOpen">Open</UiButton>
        <UiButton
          size="compact"
          :tone="savedFlash ? 'ok' : activeDirty ? 'attention' : 'neutral'"
          :icon="savedFlash ? '✓' : activeDirty ? '●' : '💾'"
          :title="`${saveLabel} (Ctrl/⌘+S)`"
          @click="onSave(false)"
        >
          {{ savedFlash ? 'Saved' : saveLabel }}
        </UiButton>
        <UiButton
          v-if="supportsFileSystemAccess"
          size="compact"
          title="Save to a different file (Ctrl/⌘+Shift+S)"
          @click="onSave(true)"
        >
          Save as…
        </UiButton>
        <UiButton
          size="compact"
          tone="primary"
          icon="⤓"
          :disabled="exporting"
          title="Export as PDF — opens the print window; choose “Save as PDF” (Ctrl/⌘+P)"
          @click="onExport"
        >
          {{ exporting ? 'Preparing…' : 'Export PDF' }}
        </UiButton>
      </div>

      <div class="topbar-end">
        <div class="update-slot" ref="updateSlot">
          <button v-if="updateAvailable" class="update-btn" @click="showUpdatePanel = !showUpdatePanel">
            Update available
          </button>
          <div v-if="showUpdatePanel && updateAvailable" class="update-pop" role="dialog">
            <div class="up-line">running {{ buildId }} · {{ buildTime }}</div>
            <div class="up-line">live {{ published?.commit }} · {{ published?.builtAt }}</div>
            <button class="reload-btn update-ready" @click="onReloadLatest">Update ready — Reload</button>
          </div>
        </div>
        <UiButton
          v-if="active"
          size="compact"
          :icon="paper === 'light' ? '☀' : '☾'"
          :title="`Panel theme: ${paper}. Click for ${paper === 'light' ? 'dark' : 'light'}.`"
          :aria-label="`Switch panels to ${paper === 'light' ? 'dark' : 'light'}`"
          @click="togglePaper"
        >
          {{ paper === 'light' ? 'Light' : 'Dark' }}
        </UiButton>
        <UiButton size="compact" aria-label="Help" title="Help" @click="showHelp = true">? Help</UiButton>
      </div>
    </header>

    <TabBar
      v-if="state.tabs.length"
      :tabs="state.tabs"
      :active-id="state.activeId"
      @activate="tabs.activate"
      @close="tabs.close"
      @new="tabs.newTab"
    />

    <Workspace v-if="active" ref="workspace" :tab="active" @reconnect="tabs.reconnect(active)" />

    <section v-else-if="state.ready" class="empty">
      <div class="empty-card">
        <h2>Edit a markdown file on your computer</h2>
        <p class="muted-p">
          Open a local <code>.md</code> file and it opens in a tab: write on the left, see it rendered on the
          right. <strong>Save</strong> writes straight back to the file. Each tab is its own file.
        </p>
        <div class="empty-actions">
          <UiButton size="large" tone="primary" icon="📂" @click="onOpen">Open a file</UiButton>
          <UiButton size="large" icon="＋" @click="tabs.newTab">New file</UiButton>
        </div>
        <p v-if="!supportsFileSystemAccess" class="note">
          <span aria-hidden="true">⚠</span> This browser can't write to files on your computer, so Save will
          download a copy instead. To save in place, use Chrome, Edge, Brave or another Chromium browser on a
          desktop.
        </p>
        <p class="hint">
          Shortcuts: <kbd>Ctrl/⌘ S</kbd> save · <kbd>Ctrl/⌘ O</kbd> open · <kbd>Ctrl/⌘ P</kbd> PDF ·
          <kbd>Ctrl/⌘ \</kbd> hide editor · <kbd>Ctrl/⌘ ⇧ \</kbd> hide preview
        </p>
      </div>
    </section>

    <footer class="debug">
      <div class="debug-bar">
        <span class="build-stamp">
          build {{ buildId }} · {{ buildTime }}
          <template v-if="versionStatus === 'current'"> · up to date</template>
          <template v-else-if="updateAvailable"> · {{ published?.commit }} is live</template>
        </span>

        <button
          class="reload-btn logs-btn"
          :class="{ 'has-errors': errorCount > 0 }"
          @click="showDebug = !showDebug"
        >
          {{ showDebug ? 'Hide logs' : 'View logs' }}
          <span v-if="errorCount" class="err-count">{{ errorCount }}</span>
        </button>

        <button class="reload-btn" :class="{ 'update-ready': updateAvailable }" @click="onReloadLatest">
          {{
            alreadyLatest
              ? 'Already on the latest build ✓'
              : updateAvailable
                ? 'Update ready — Reload'
                : 'Reload latest'
          }}
        </button>
      </div>

      <div v-if="showDebug" class="log-window">
        <div class="log-head">
          <span class="muted">
            {{ debugState.logs.length }} {{ debugState.logs.length === 1 ? 'entry' : 'entries' }}
          </span>
          <button class="reload-btn" @click="copyLog">
            {{ copied ? 'Copied ✓' : 'Copy log' }}
          </button>
        </div>
        <p class="log-hint muted">Something not working? Tap <strong>Copy log</strong> and paste it to Claude.</p>
        <ul class="debug-log">
          <li v-if="!debugState.logs.length" class="muted">No log entries yet.</li>
          <li v-for="(l, i) in debugState.logs" :key="i" :class="l.kind">
            <span class="muted">{{ l.time }}</span> {{ l.msg
            }}<span v-if="l.count > 1" class="repeat">×{{ l.count }}</span>
          </li>
        </ul>
      </div>
    </footer>

    <HelpModal :open="showHelp" :initial-doc="helpDoc" @close="showHelp = false" />
  </main>
</template>

<style scoped>
.app {
  height: 100svh;
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top);
}

.topbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  padding: 0.55rem 0.9rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.logo {
  width: 1.5rem;
  height: 1.5rem;
}
.app-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
  white-space: nowrap;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.topbar-end {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.update-slot {
  position: relative;
}

.update-btn {
  background: var(--bg-elev-2);
  border: 1px solid var(--accent-blue);
  color: var(--text);
  font-weight: 600;
  font-size: 0.78rem;
  height: 1.9rem;
  padding: 0 0.6rem;
  border-radius: 0.4rem;
  white-space: nowrap;
}
.update-btn:hover {
  background: var(--accent-blue);
  color: var(--on-accent);
}

.update-pop {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 70;
  width: max-content;
  max-width: min(18rem, calc(100vw - 1rem));
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.7rem;
  background: var(--overlay-bg);
  border: 1px solid var(--accent-blue);
  border-radius: 0.4rem;
  box-shadow: var(--shadow);
}

.up-line {
  font-size: 0.72rem;
  color: var(--text-muted);
}

/* ---- empty state ---- */

.empty {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 1.5rem 1rem;
  overflow: auto;
}
.empty-card {
  max-width: 34rem;
  padding: 1.8rem 1.6rem;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  box-shadow: var(--shadow);
  text-align: center;
}
.empty-card h2 {
  margin: 0 0 0.6rem;
  font-size: 1.3rem;
}
.muted-p {
  color: var(--text-muted);
  margin: 0 0 1.3rem;
}
.empty-card code {
  font-family: var(--mono);
  font-size: 0.88em;
  background: var(--bg-elev-2);
  padding: 0.1em 0.35em;
  border-radius: 0.3em;
}
.empty-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.note {
  margin: 1.2rem 0 0;
  padding: 0.55rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--warn) 50%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--warn) 9%, var(--bg-elev));
  font-size: 0.82rem;
  text-align: left;
}
.note > span {
  color: var(--warn);
}
.hint {
  margin: 1.2rem 0 0;
  font-size: 0.74rem;
  color: var(--text-muted);
}
kbd {
  font-family: var(--mono);
  font-size: 0.9em;
  padding: 0.05em 0.35em;
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 0.3em;
  background: var(--bg-elev-2);
  color: var(--text);
}

/* ---- footer (from the template's wrapper) ---- */

.muted {
  color: var(--text-muted);
  font-weight: 400;
  font-size: 0.85rem;
}

.debug {
  border-top: 1px solid var(--border);
  padding: 0.3rem 0.9rem max(0.3rem, env(safe-area-inset-bottom));
}

.debug-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.build-stamp {
  color: var(--text-muted);
  font-size: 0.7rem;
  margin-right: auto;
}

.logs-btn.has-errors {
  border-color: var(--danger);
  color: var(--danger);
  font-weight: 600;
}

.err-count {
  display: inline-block;
  min-width: 1.05rem;
  margin-left: 0.3rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--danger);
  color: var(--on-accent);
  font-size: 0.65rem;
  line-height: 1.05rem;
  text-align: center;
}

.log-window {
  margin-top: 0.5rem;
}

.log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.log-hint {
  margin: 0.25rem 0 0;
  font-size: 0.7rem;
}

.repeat {
  margin-left: 0.35rem;
  opacity: 0.65;
}

.reload-btn {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 0.4rem;
}
.reload-btn:hover {
  color: var(--text);
  border-color: var(--accent-blue);
}

.reload-btn.update-ready {
  border-color: var(--accent-blue);
  color: var(--text);
  font-weight: 600;
}

.debug-log {
  list-style: none;
  padding: 0.5rem;
  margin: 0.4rem 0 0;
  background: #060912;
  color: #cdd3e0;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  font-family: var(--mono);
  font-size: 0.7rem;
  line-height: 1.5;
  max-height: 12rem;
  overflow: auto;
}

.debug-log .error {
  color: var(--danger);
}

.debug-log .warn {
  color: var(--warn);
}
</style>
