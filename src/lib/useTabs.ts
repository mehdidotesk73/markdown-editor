import { reactive, computed, watch } from 'vue'
import { get, set } from 'idb-keyval'
import {
  pickFiles,
  pickSaveTarget,
  pickReplacement,
  permissionOf,
  accessProblem,
  errorText,
  isAbort,
  readFile,
  writeFile,
  step,
  downloadText,
  supportsFileSystemAccess,
  type PickedFile,
} from './fileAccess'
import { logDebug } from '../debug'
import { pruneViews } from './tabView'
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
  /** Why the last write of tabs + drafts to the browser's storage failed; null when it works. */
  storageError: null as string | null,
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
    if (state.storageError) logDebug('Drafts are being kept in the browser again')
    state.storageError = null
  } catch (e) {
    const msg = (e as Error).message
    // Shown as a banner, not just a log line: unsaved drafts aren't backed up while it lasts.
    if (state.storageError !== msg)
      logDebug(`Could not store tabs locally: ${msg} — the browser couldn't write this site's storage (often a full disk, or Edge/Chrome's site storage is damaged). Unsaved drafts aren't backed up until it works again.`, 'error')
    state.storageError = msg
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
      const count = (a: Tab['access']) => state.tabs.filter((t) => t.access === a).length
      const waiting = state.tabs.filter((t) => t.access === 'needs-access').map((t) => t.name)
      logDebug(
        `Restored ${state.tabs.length} tab(s): ${count('linked')} linked, ${count('needs-access')} need reconnecting, ${count('unlinked')} not linked to a file` +
          (waiting.length ? ` (${waiting.join(', ')})` : ''),
      )
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
  const was = t.access
  try {
    // A background check only needs to read the file (Open and Choose file grant
    // just that); Reconnect asks for read + write, so Save works right after it.
    const perm = await permissionOf(t.handle, ask, undefined, ask ? 'readwrite' : 'read')
    if (perm !== 'granted') {
      t.access = 'needs-access'
      if (ask) logDebug(`Reconnect ${t.name}: ${accessProblem(t.name, perm)}`, 'warn')
      else if (was === 'linked') logDebug(`Lost access to ${t.name} (browser now says "${perm}") — click Reconnect.`, 'warn')
      return false
    }
    if (ask) logDebug(`Reconnect ${t.name}: access granted — reading the file…`)
    const f = await readFile(t.handle)
    t.access = 'linked'
    t.name = f.name
    if (f.lastModified !== t.lastModified || f.text !== t.saved) {
      const wasClean = !isDirty(t)
      t.saved = f.text
      t.lastModified = f.lastModified
      if (wasClean) t.content = f.text
      if (was === 'linked') logDebug(`${t.name} changed on disk — ${wasClean ? 'loaded the new version' : 'kept your unsaved edits'}`)
    }
    if (was !== 'linked') logDebug(`Reconnected ${t.name}${isDirty(t) ? ' (your unsaved edits are kept)' : ''}`)
    return true
  } catch (e) {
    // NotFoundError: the file was moved or deleted. Keep the text, drop the link.
    if (e instanceof DOMException && e.name === 'NotFoundError') {
      logDebug(`${t.name} is no longer on disk (moved or deleted) — your text is kept; Save will ask where to put it.`, 'warn')
      t.handle = null
      t.access = 'unlinked'
      t.saved = ''
    } else if ((e as Error).name === 'StalledError') {
      t.access = 'needs-access'
      logDebug(`${ask ? 'Reconnect' : 'Restore'} ${t.name}: ${(e as Error).message}`, ask ? 'error' : 'warn')
    } else {
      logDebug(`Could not read ${t.name}: ${errorText(e)}`, ask ? 'error' : 'warn')
    }
    return false
  }
}

/**
 * Ask for write access straight after a file is picked — the pick is the click
 * the browser's prompt needs — so the user answers once, up front, and Save
 * and the background checks just work until something really disconnects.
 * If the browser declines (or won't prompt here), the file stays open and
 * Save asks again later.
 */
async function askWriteAccess(handle: FileSystemFileHandle, what: string) {
  try {
    const a = await permissionOf(handle, true, undefined, 'readwrite')
    if (a === 'granted') logDebug(`${what}: write access to ${handle.name} granted`)
    else logDebug(`${what}: write access to ${handle.name} not granted yet (${a}) — Save will ask`, 'warn')
  } catch (e) {
    logDebug(`${what}: couldn't ask for write access to ${handle.name} (${errorText(e)}) — Save will ask`, 'warn')
  }
}

/** Reconnect a restored tab to its file (shows the browser's permission prompt). */
const reconnecting = new Set<string>()
async function reconnect(t: Tab) {
  if (reconnecting.has(t.id)) {
    logDebug(`Reconnect ${t.name}: still waiting on the last attempt`)
    return
  }
  reconnecting.add(t.id)
  logDebug(`Reconnect ${t.name}: checking access…`)
  try {
    await refreshFromDisk(t, true)
  } finally {
    reconnecting.delete(t.id)
  }
}

/**
 * Link a tab to a file the user picks again — the way back when the browser
 * won't grant access to the old link. The tab's unsaved edits are kept.
 */
async function relink(t: Tab): Promise<boolean> {
  logDebug(`Choose file for ${t.name}: opening the file picker…`)
  try {
    const f = await pickReplacement(t.handle)
    if (!f?.handle) {
      logDebug(`Choose file for ${t.name}: cancelled`)
      return false
    }
    await askWriteAccess(f.handle, 'Choose file')
    const keepDraft = isDirty(t)
    const old = t.name
    t.handle = f.handle
    t.name = f.name
    t.saved = f.text
    t.lastModified = f.lastModified
    if (!keepDraft) t.content = f.text
    t.access = 'linked'
    logDebug(`Linked ${old === f.name ? f.name : `${old} → ${f.name}`}${keepDraft ? ' (your unsaved edits are kept)' : ''}`)
    return true
  } catch (e) {
    logDebug(`Choose file for ${t.name} failed: ${errorText(e)}`, 'error')
    return false
  }
}

/** Re-check every linked tab against disk — e.g. when the window regains focus. */
async function refreshAll() {
  await Promise.all(state.tabs.filter((t) => t.access === 'linked').map((t) => refreshFromDisk(t, false)))
}

// ---- tab actions -----------------------------------------------------------

/** How long Open waits, in all, for open tabs to say whether they hold the picked file. */
const COMPARE_MS = 2000

/** The open tab holding the same file as `f`, if any — tabs that don't answer in time don't count. */
async function findOpenTab(f: PickedFile): Promise<Tab | null> {
  if (!f.handle) return null
  const candidates = state.tabs.filter((t) => t.handle)
  const answers = await Promise.all(
    candidates.map((t) =>
      step(t.handle!.isSameEntry(f.handle!), 'Comparing with the open tab', t.name, COMPARE_MS).catch((e: Error) => {
        if (e.name === 'StalledError') logDebug(`Open ${f.name}: the tab ${t.name} didn't answer, so it's treated as a different file`, 'warn')
        return false // a stale handle can't be compared either
      }),
    ),
  )
  return candidates[answers.indexOf(true)] ?? null
}

async function addPicked(f: PickedFile) {
  // Already open? Just switch to it.
  // Its fresh handle comes with the access the picker just granted, so a tab
  // waiting to be reconnected is linked again by opening its file.
  // Every tab is asked at once, with one short limit: a stuck tab (its handle
  // never answers) counts as a different file, so it can't hold up Open.
  const t = await findOpenTab(f)
  if (t) {
    state.activeId = t.id
    const keepDraft = isDirty(t)
    const was = t.access
    t.handle = f.handle
    t.name = f.name
    t.saved = f.text
    t.lastModified = f.lastModified
    if (!keepDraft) t.content = f.text
    t.access = 'linked'
    logDebug(`${f.name} was already open — switched to it${was !== 'linked' ? ' and reconnected it' : ''}${keepDraft ? ' (your unsaved edits are kept)' : ''}`)
    return
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
  logDebug('Open: showing the file picker…')
  let files: PickedFile[]
  try {
    files = await pickFiles((names) => logDebug(`Open: picked ${names.join(', ')} — reading…`))
  } catch (e) {
    logDebug(`Open failed: ${(e as Error).name === 'StalledError' ? (e as Error).message : errorText(e)}`, 'error')
    return
  }
  if (!files.length) return logDebug('Open: cancelled')
  for (const f of files) if (f.handle) await askWriteAccess(f.handle, 'Open')
  for (const f of files) await addPicked(f)
  logDebug(`Opened ${files.map((f) => f.name).join(', ')}${files[0].handle ? '' : ' (read-only copy: this browser saves by downloading)'}`)
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
  const what = saveAs ? 'Save as' : 'Save'
  try {
    if (!supportsFileSystemAccess) {
      downloadText(t.name, t.content)
      t.saved = t.content
      logDebug(`${what}: downloaded ${t.name} (this browser can't write files in place)`)
      return true
    }
    if (!t.handle || saveAs) {
      logDebug(`${what} ${t.name}: asking where to save…`)
      const handle = await pickSaveTarget(t.name)
      if (!handle) {
        logDebug(`${what} ${t.name}: cancelled`)
        return false
      }
      t.handle = handle
      t.name = handle.name
    } else if (t.access !== 'linked') {
      logDebug(`${what} ${t.name}: asking the browser for access first…`)
    }
    t.lastModified = await writeFile(t.handle, t.content)
    t.saved = t.content
    const reconnected = t.access !== 'linked'
    t.access = 'linked'
    logDebug(`${what}: saved ${t.name} (${t.content.length.toLocaleString()} characters)${reconnected ? ' — and reconnected it' : ''}`)
    return true
  } catch (e) {
    if (isAbort(e)) {
      logDebug(`${what} ${t.name}: cancelled`)
      return false
    }
    if ((e as Error).name === 'NoAccessError') {
      t.access = 'needs-access'
      logDebug(`${what} failed — ${(e as Error).message} Your text is safe here; "Save as…" saves it to a new file.`, 'error')
    } else if (e instanceof DOMException && e.name === 'NotFoundError') {
      logDebug(`${what} failed — ${t.name} is no longer where it was. Use "Save as…" to put it somewhere.`, 'error')
    } else {
      logDebug(`${what} failed for ${t.name}: ${errorText(e)}`, 'error')
    }
    return false
  }
}

function close(t: Tab) {
  if (isDirty(t) && !confirm(`${t.name} has unsaved changes. Close it anyway?`)) return logDebug(`Close ${t.name}: kept open (unsaved changes)`)
  if (isDirty(t)) logDebug(`Closed ${t.name} — its unsaved changes were discarded`, 'warn')
  const i = state.tabs.findIndex((x) => x.id === t.id)
  if (i < 0) return
  state.tabs.splice(i, 1)
  pruneViews(state.tabs.map((x) => x.id))
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
    relink,
    refreshAll,
  }
}
