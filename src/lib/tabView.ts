// Where each open file was left: the cursor / selection in the editor and the
// scroll position of both panes, so switching tabs (or reloading) returns to
// the same place instead of the top. Kept per tab id in localStorage — a
// viewer convenience, so a failed read or write just means starting at the top.

export interface TabView {
  /** Selection in the editor (equal when it's just a cursor). */
  selStart: number
  selEnd: number
  /** Scroll offsets in px. */
  editorTop: number
  previewTop: number
}

const KEY = 'md-editor:views'
const views = new Map<string, TabView>(load())
let timer: ReturnType<typeof setTimeout> | undefined

function load(): [string, TabView][] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (Object.entries(JSON.parse(raw)) as [string, TabView][]) : []
  } catch {
    return []
  }
}

function persist() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(views)))
    } catch {
      /* storage full or blocked: positions just won't survive a reload */
    }
  }, 300)
}

export function getView(id: string): TabView | undefined {
  return views.get(id)
}

/** Record part of a tab's view (only the fields given change). */
export function saveView(id: string, patch: Partial<TabView>) {
  const prev = views.get(id) ?? { selStart: 0, selEnd: 0, editorTop: 0, previewTop: 0 }
  views.set(id, { ...prev, ...patch })
  persist()
}

/** Forget a closed tab, and any tabs no longer open. */
export function pruneViews(openIds: Iterable<string>) {
  const keep = new Set(openIds)
  let changed = false
  for (const id of views.keys())
    if (!keep.has(id)) {
      views.delete(id)
      changed = true
    }
  if (changed) persist()
}

/** A selection clamped to a text of this length (the file may have changed on disk). */
export function clampSelection(v: TabView, length: number): [number, number] {
  const s = Math.max(0, Math.min(v.selStart, length))
  return [s, Math.max(s, Math.min(v.selEnd, length))]
}
