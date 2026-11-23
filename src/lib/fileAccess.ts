// Local file access. Chromium browsers (Chrome, Edge, Brave, Arc, Opera) have
// the File System Access API: the app keeps a handle to the real file on disk
// and Save writes straight back to it. Everywhere else (Safari, Firefox,
// phones) files are opened with a plain file input and Save downloads a copy.

export interface PickedFile {
  name: string
  text: string
  lastModified: number
  handle: FileSystemFileHandle | null
}

type PermissionMode = { mode: 'read' | 'readwrite' }

// Not yet in TypeScript's DOM lib.
interface FsaHandle extends FileSystemFileHandle {
  queryPermission(d: PermissionMode): Promise<PermissionState>
  requestPermission(d: PermissionMode): Promise<PermissionState>
}
interface FsaWindow {
  showOpenFilePicker(o?: object): Promise<FileSystemFileHandle[]>
  showSaveFilePicker(o?: object): Promise<FileSystemFileHandle>
}

const fsa = (typeof window === 'undefined' ? {} : window) as unknown as Partial<FsaWindow>

export const supportsFileSystemAccess =
  typeof fsa.showOpenFilePicker === 'function' && typeof fsa.showSaveFilePicker === 'function'

const MD_TYPES = [
  {
    description: 'Markdown / text',
    accept: { 'text/markdown': ['.md', '.markdown', '.mdx'], 'text/plain': ['.txt'] },
  },
]
const ACCEPT_ATTR = '.md,.markdown,.mdx,.txt,text/markdown,text/plain'

/** The user dismissed a picker — not an error worth logging. */
export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

async function readHandle(handle: FileSystemFileHandle): Promise<PickedFile> {
  const file = await handle.getFile()
  return { name: file.name, text: await file.text(), lastModified: file.lastModified, handle }
}

/** Let the user pick one or more files. Resolves [] if they cancel. */
export async function pickFiles(): Promise<PickedFile[]> {
  if (supportsFileSystemAccess) {
    try {
      const handles = await fsa.showOpenFilePicker!({ multiple: true, types: MD_TYPES, id: 'md-open' })
      return Promise.all(handles.map(readHandle))
    } catch (e) {
      if (isAbort(e)) return []
      throw e
    }
  }
  return pickWithInput()
}

function pickWithInput(): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = ACCEPT_ATTR
    input.addEventListener('change', async () => {
      const files = Array.from(input.files ?? [])
      resolve(
        await Promise.all(
          files.map(async (f) => ({ name: f.name, text: await f.text(), lastModified: f.lastModified, handle: null })),
        ),
      )
    })
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

/** Ask where to save a new file. Null if cancelled or unsupported. */
export async function pickSaveTarget(suggestedName: string): Promise<FileSystemFileHandle | null> {
  if (!supportsFileSystemAccess) return null
  try {
    return await fsa.showSaveFilePicker!({ suggestedName, types: MD_TYPES, id: 'md-save' })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** What the browser said when asked for access, or that it never answered. */
export type Access = PermissionState | 'no-answer'

/** How long to wait for the browser's permission prompt before saying so in the log. */
export const PERMISSION_WAIT_MS = 15_000

/**
 * Current permission for a stored handle. A handle restored after a reload
 * usually comes back as 'prompt': the browser needs a click before it will
 * let the page touch the file again. With `ask`, the browser's prompt is
 * requested when access isn't already granted. A prompt the browser never answers resolves as
 * 'no-answer' after PERMISSION_WAIT_MS instead of leaving the caller waiting
 * forever.
 */
export async function permissionOf(handle: FileSystemFileHandle, ask = false, waitMs = PERMISSION_WAIT_MS): Promise<Access> {
  const h = handle as FsaHandle
  if (typeof h.queryPermission !== 'function') return 'granted'
  const mode: PermissionMode = { mode: 'readwrite' }
  const state = await h.queryPermission(mode)
  if (state === 'granted' || !ask) return state
  let timer: ReturnType<typeof setTimeout> | undefined
  const noAnswer = new Promise<Access>((resolve) => (timer = setTimeout(() => resolve('no-answer'), waitMs)))
  try {
    return await Promise.race([h.requestPermission(mode), noAnswer])
  } finally {
    clearTimeout(timer)
  }
}

/** Why access is missing, in words for the log. */
export function accessProblem(name: string, a: Access): string {
  if (a === 'denied') return `the browser refused access to ${name} (blocked, or "Don't allow" was chosen). Use "Choose file…" to pick it again.`
  if (a === 'no-answer')
    return `the browser didn't answer the request for access to ${name}. Look for a prompt by the address bar, or use "Choose file…" to pick the file again.`
  return `access to ${name} wasn't granted (the prompt was dismissed). Click Reconnect to ask again.`
}

/** Why something failed, for the log. */
export function errorText(e: unknown): string {
  if (e instanceof DOMException || e instanceof Error) return `${e.name}: ${e.message}`
  return String(e)
}

/**
 * Pick one file to stand in for a tab whose link was lost — opens where the
 * old file was when the browser can. Null if cancelled.
 */
export async function pickReplacement(old: FileSystemFileHandle | null): Promise<PickedFile | null> {
  if (!supportsFileSystemAccess) return null
  try {
    const opts = { multiple: false, types: MD_TYPES, id: 'md-open', ...(old ? { startIn: old } : {}) }
    let handles: FileSystemFileHandle[]
    try {
      handles = await fsa.showOpenFilePicker!(opts)
    } catch (e) {
      // A stale handle can make startIn itself fail: try again without it.
      if (isAbort(e) || !old) throw e
      handles = await fsa.showOpenFilePicker!({ multiple: false, types: MD_TYPES, id: 'md-open' })
    }
    return handles[0] ? readHandle(handles[0]) : null
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

/** Re-read a linked file from disk. */
export async function readFile(handle: FileSystemFileHandle): Promise<PickedFile> {
  return readHandle(handle)
}

/** Overwrite a linked file on disk. Returns the file's new lastModified. */
export class NoAccessError extends Error {
  constructor(public access: Access, name: string) {
    super(accessProblem(name, access))
    this.name = 'NoAccessError'
  }
}

export async function writeFile(handle: FileSystemFileHandle, text: string): Promise<number> {
  const access = await permissionOf(handle, true)
  if (access !== 'granted') throw new NoAccessError(access, handle.name)
  const w = await handle.createWritable()
  await w.write(text)
  await w.close()
  return (await handle.getFile()).lastModified
}

/** The fallback "save": download the text as a file. */
export function downloadText(name: string, text: string) {
  downloadBlob(name, new Blob([text], { type: 'text/markdown;charset=utf-8' }))
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
