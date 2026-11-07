import { reactive, computed, watch } from 'vue'
import { get, set } from 'idb-keyval'
import {
  pickFiles,
  pickSaveTarget,
  permissionOf,
  readFile,
  writeFile,
  downloadText,
  supportsFileSystemAccess,
  type PickedFile,
} from './fileAccess'
import { logDebug } from '../debug'
// What a new document starts with: the guide to Markdown Lab and the focus shadow.
import STARTER from '../../docs/focus-shadow-showcase.md?raw'

/**
 * One open document. A tab is "linked" when it holds a handle to a real file
 * on disk; Save writes back to that file. Tabs and their unsaved drafts are
 * kept in IndexedDB, so a reload or a closed browser loses nothing.
 */
export interface Tab {
  id: string
  name: string
  handle: FileSystemFileHandle | null
  /** What's in the editor. */
  content: string
  /** What's on disk (as of the last open / save / refresh). */
  saved: string
  lastModified: number
  /**
   * linked:        handle with permission — Save writes to disk
   * needs-access:  handle restored after a reload; one click to reconnect
   * unlinked:      no file on disk yet (new tab, or a browser without file access)
   */
  access: 'linked' | 'needs-access' | 'unlinked'
}

type StoredTab = Omit<Tab, 'access'>

const STORE_KEY = 'md-editor:tabs'

const state = reactive({
  tabs: [] as Tab[],
  activeId: null as string | null,
  ready: false,
})

const active = computed(() => state.tabs.find((t) => t.id === state.activeId) ?? null)

export function isDirty(t: Tab): boolean {
  return t.content !== t.saved
}
const anyDirty = computed(() => state.tabs.some(isDirty))

function newId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
}

// ---- persistence -----------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | undefined
function schedulePersist() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(persist, 300)
}

async function persist() {
  const tabs: StoredTab[] = state.tabs.map((t) => ({
    id: t.id,
    name: t.name,
    handle: t.handle,
    content: t.content,
    saved: t.saved,
    lastModified: t.lastModified,
  }))
  try {
    await set(STORE_KEY, { tabs, activeId: state.activeId })
  } catch (e) {
    logDebug(`Could not store tabs locally: ${(e as Error).message}`, 'warn')
  }
}

async function restore() {
  try {
    const stored = (await get(STORE_KEY)) as { tabs: StoredTab[]; activeId: string | null } | undefined
    if (stored?.tabs?.length) {
      state.tabs = stored.tabs.map((t) => ({ ...t, access: t.handle ? 'needs-access' : 'unlinked' }))
      state.activeId = stored.tabs.some((t) => t.id === stored.activeId) ? stored.activeId : stored.tabs[0].id
      // Reconnect silently wherever the browser still grants access.
      await Promise.all(state.tabs.map((t) => refreshFromDisk(t, false)))
    }
  } catch (e) {
    logDebug(`Could not restore tabs: ${(e as Error).message}`, 'warn')
  }
  state.ready = true
  watch(() => [state.tabs, state.activeId], schedulePersist, { deep: true })
}

// ---- disk sync -------------------------------------------------------------

/**
 * Pick up the file's current contents from disk. If the tab has no unsaved
 * edits the editor follows the disk; if it does, the draft is kept and the
 * tab simply shows as changed against the new disk version.
 * `ask` = allowed to show the browser's permission prompt (needs a click).
 */
async function refreshFromDisk(t: Tab, ask: boolean): Promise<boolean> {
  if (!t.handle) return false
  try {
    const perm = await permissionOf(t.handle, ask)
    if (perm !== 'granted') {
      t.access = 'needs-access'
      return false
    }
    const f = await readFile(t.handle)
    t.access = 'linked'
    t.name = f.name
    if (f.lastModified !== t.lastModified || f.text !== t.saved) {
      const wasClean = !isDirty(t)
      t.saved = f.text
      t.lastModified = f.lastModified
      if (wasClean) t.content = f.text
    }
    return true
  } catch (e) {
    // NotFoundError: the file was moved or deleted. Keep the text, drop the link.
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      logDebug(`${t.name} is no longer on disk — Save will ask where to put it.`, 'warn')
      t.handle = null
      t.access = 'unlinked'
      t.saved = ''
    } else {
      logDebug(`Could not read ${t.name}: ${(e as Error).message}`, 'warn')
    }
    return false
  }
}

/** Reconnect a restored tab to its file (shows the browser's permission prompt). */
async function reconnect(t: Tab) {
  await refreshFromDisk(t, true)
}

/** Re-check every linked tab against disk — e.g. when the window regains focus. */
async function refreshAll() {
  await Promise.all(state.tabs.filter((t) => t.access === 'linked').map((t) => refreshFromDisk(t, false)))
}

// ---- tab actions -----------------------------------------------------------

async function addPicked(f: PickedFile) {
  // Already open? Just switch to it.
  for (const t of state.tabs) {
    if (f.handle && t.handle && (await t.handle.isSameEntry(f.handle))) {
      state.activeId = t.id
      await refreshFromDisk(t, true)
      return
    }
  }
  const tab: Tab = {
    id: newId(),
    name: f.name,
    handle: f.handle,
    content: f.text,
    saved: f.text,
    lastModified: f.lastModified,
    access: f.handle ? 'linked' : 'unlinked',
  }
  state.tabs.push(tab)
  state.activeId = tab.id
}

async function openFiles() {
  const files = await pickFiles()
  for (const f of files) await addPicked(f)
  if (files.length) logDebug(`Opened ${files.map((f) => f.name).join(', ')}`)
}

function untitledName(): string {
  const taken = new Set(state.tabs.map((t) => t.name))
  let n = 1
  while (taken.has(n === 1 ? 'Untitled.md' : `Untitled ${n}.md`)) n++
  return n === 1 ? 'Untitled.md' : `Untitled ${n}.md`
}

/**
 * The one way to start a new document (＋ on the tab bar, New file on the
 * empty screen, Ctrl/⌘+Alt+N). It opens prefilled with the starter text —
 * the Focus Shadow guide — and counts as unchanged until edited, so closing
 * it untouched doesn't ask. Its first Save asks where to put the file.
 */
function newDocument() {
  const tab: Tab = {
    id: newId(),
    name: untitledName(),
    handle: null,
    content: STARTER,
    saved: STARTER,
    lastModified: 0,
    access: 'unlinked',
  }
  state.tabs.push(tab)
  state.activeId = tab.id
}

/**
 * Save a tab. Linked → write to its file. Unlinked → ask where to save
 * (which links it from then on). No file-access API → download a copy.
 * `saveAs` always asks for a new location.
 */
async function save(t: Tab, saveAs = false): Promise<boolean> {
  try {
    if (!supportsFileSystemAccess) {
      downloadText(t.name, t.content)
      t.saved = t.content
      logDebug(`Downloaded ${t.name} (this browser can't write files in place)`)
      return true
    }
    if (!t.handle || saveAs) {
      const handle = await pickSaveTarget(t.name)
      if (!handle) return false
      t.handle = handle
      t.name = handle.name
    }
    t.lastModified = await writeFile(t.handle, t.content)
    t.saved = t.content
    t.access = 'linked'
    logDebug(`Saved ${t.name}`)
    return true
  } catch (e) {
    logDebug(`Save failed for ${t.name}: ${(e as Error).message}`, 'error')
    return false
  }
}

function close(t: Tab) {
  if (isDirty(t) && !confirm(`${t.name} has unsaved changes. Close it anyway?`)) return
  const i = state.tabs.findIndex((x) => x.id === t.id)
  if (i < 0) return
  state.tabs.splice(i, 1)
  if (state.activeId === t.id) {
    state.activeId = state.tabs[Math.min(i, state.tabs.length - 1)]?.id ?? null
  }
}

function activate(id: string) {
  state.activeId = id
  const t = state.tabs.find((x) => x.id === id)
  if (t?.access === 'linked') void refreshFromDisk(t, false)
}

let restored: Promise<void> | null = null

export function useTabs() {
  restored ??= restore()
  return {
    state,
    active,
    anyDirty,
    openFiles,
    newDocument,
    save,
    close,
    activate,
    reconnect,
    refreshAll,
  }
}
