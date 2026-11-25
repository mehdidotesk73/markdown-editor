// The tab store's file paths — restore, reconnect, choose file, open, save,
// save as, a file that disappears — against a faked file system. Each case
// also checks what the on-screen log says, since that's what the user sees.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Access, PickedFile } from './fileAccess'

const fs = vi.hoisted(() => ({
  stored: undefined as unknown,
  permission: 'prompt' as string,
  request: 'granted' as string,
  disk: new Map<string, { text: string; lastModified: number }>(),
  pick: [] as unknown[],
  saveTarget: null as unknown,
  replacement: null as unknown,
  readStalls: false,
}))

vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => fs.stored),
  set: vi.fn(async () => {}),
}))

vi.mock('./fileAccess', async (importOriginal) => {
  const real = await importOriginal<typeof import('./fileAccess')>()
  const notFound = (name: string) => new DOMException(`${name} is gone`, 'NotFoundError')
  return {
    ...real,
    supportsFileSystemAccess: true,
    permissionOf: vi.fn(async (_h: FileSystemFileHandle, ask = false): Promise<Access> => (ask ? (fs.request as Access) : (fs.permission as Access))),
    readFile: vi.fn(async (h: FileSystemFileHandle): Promise<PickedFile> => {
      if (fs.readStalls) throw new real.StalledError('Opening', h.name)
      const f = fs.disk.get(h.name)
      if (!f) throw notFound(h.name)
      return { name: h.name, text: f.text, lastModified: f.lastModified, handle: h }
    }),
    writeFile: vi.fn(async (h: FileSystemFileHandle, text: string) => {
      const access = fs.permission === 'granted' ? 'granted' : (fs.request as Access)
      if (access !== 'granted') throw new real.NoAccessError(access, h.name)
      fs.disk.set(h.name, { text, lastModified: 99 })
      return 99
    }),
    pickFiles: vi.fn(async (onPicked?: (names: string[]) => void) => {
      const picked = fs.pick as PickedFile[]
      if (picked.length) onPicked?.(picked.map((f) => f.name))
      return picked
    }),
    pickSaveTarget: vi.fn(async () => fs.saveTarget),
    pickReplacement: vi.fn(async () => fs.replacement),
    downloadText: vi.fn(),
  }
})

const fileHandle = (name: string) =>
  ({ kind: 'file', name, isSameEntry: async (o: { name: string }) => o.name === name }) as unknown as FileSystemFileHandle

async function load(tabs: { name: string; content: string; saved: string; linked?: boolean }[]) {
  vi.resetModules()
  fs.stored = {
    tabs: tabs.map((t, i) => ({ id: `t${i}`, name: t.name, handle: t.linked === false ? null : fileHandle(t.name), content: t.content, saved: t.saved, lastModified: 1 })),
    activeId: 't0',
  }
  const { useTabs } = await import('./useTabs')
  const { debugState } = await import('../debug')
  const store = useTabs()
  await vi.waitFor(() => expect(store.state.ready).toBe(true))
  const log = () => debugState.logs.map((l) => `[${l.kind}] ${l.msg}`)
  return { ...store, log, tab: (i: number) => store.state.tabs[i] }
}

beforeEach(() => {
  fs.permission = 'prompt'
  fs.request = 'granted'
  fs.disk = new Map([
    ['a.md', { text: 'A on disk', lastModified: 5 }],
    ['b.md', { text: 'B on disk', lastModified: 5 }],
  ])
  fs.pick = []
  fs.saveTarget = null
  fs.replacement = null
  fs.readStalls = false
})

describe('restoring tabs after a reload', () => {
  it('brings linked tabs back waiting for a click, and logs how many', async () => {
    const s = await load([
      { name: 'a.md', content: 'A', saved: 'A' },
      { name: 'b.md', content: 'B edited', saved: 'B' },
    ])
    expect(s.state.tabs.map((t) => t.access)).toEqual(['needs-access', 'needs-access'])
    expect(s.log()).toContain('[log] Restored 2 tab(s): 0 linked, 2 need reconnecting, 0 not linked to a file (a.md, b.md)')
  })

  it('links them at once where the browser still allows it', async () => {
    fs.permission = 'granted'
    const s = await load([{ name: 'a.md', content: 'A', saved: 'A' }])
    expect(s.tab(0).access).toBe('linked')
    expect(s.tab(0).content).toBe('A on disk')
  })
})

describe('Reconnect', () => {
  it('links the tab and loads the file when access is granted', async () => {
    const s = await load([{ name: 'a.md', content: 'A', saved: 'A' }])
    await s.reconnect(s.tab(0))
    expect(s.tab(0).access).toBe('linked')
    expect(s.tab(0).content).toBe('A on disk')
    expect(s.log()).toContain('[log] Reconnected a.md')
  })

  it('keeps unsaved edits when reconnecting', async () => {
    const s = await load([{ name: 'a.md', content: 'my draft', saved: 'A' }])
    await s.reconnect(s.tab(0))
    expect(s.tab(0).content).toBe('my draft')
    expect(s.log()).toContain('[log] Reconnected a.md (your unsaved edits are kept)')
  })

  it.each([
    ['no-answer', /didn't answer the request for access to a\.md/],
    ['denied', /refused access to a\.md/],
    ['prompt', /wasn't granted/],
  ])('says why when the browser answers %s', async (answer, why) => {
    fs.request = answer
    const s = await load([{ name: 'a.md', content: 'A', saved: 'A' }])
    await s.reconnect(s.tab(0))
    expect(s.tab(0).access).toBe('needs-access')
    expect(s.log()).toContain('[log] Reconnect a.md: checking access…')
    expect(s.log().some((l) => l.startsWith('[warn] Reconnect a.md:') && why.test(l))).toBe(true)
  })

  it('names the step when reading the file stalls (e.g. an online-only OneDrive file)', async () => {
    const s = await load([{ name: 'a.md', content: 'A', saved: 'A' }])
    fs.readStalls = true
    await s.reconnect(s.tab(0))
    expect(s.tab(0).access).toBe('needs-access')
    expect(s.log()).toContain('[log] Reconnect a.md: access granted — reading the file…')
    expect(s.log().some((l) => l.startsWith("[error] Reconnect a.md: Opening a.md didn't finish within 15 s.") && l.includes('OneDrive'))).toBe(true)
  })

  it('still finishes restoring, and says so, when a file stalls on load', async () => {
    fs.permission = 'granted'
    fs.readStalls = true
    const s = await load([{ name: 'a.md', content: 'A', saved: 'A' }])
    expect(s.tab(0).access).toBe('needs-access')
    expect(s.log().some((l) => l.startsWith("[warn] Restore a.md: Opening a.md didn't finish"))).toBe(true)
    expect(s.log().some((l) => l.startsWith('[log] Restored 1 tab(s): 0 linked, 1 need reconnecting'))).toBe(true)
  })

  it('drops the link, keeping the text, when the file is gone', async () => {
    fs.disk.delete('a.md')
    const s = await load([{ name: 'a.md', content: 'A', saved: 'A' }])
    await s.reconnect(s.tab(0))
    expect(s.tab(0)).toMatchObject({ access: 'unlinked', handle: null, content: 'A' })
    expect(s.log().some((l) => l.startsWith('[warn] a.md is no longer on disk'))).toBe(true)
  })
})

describe('Choose file… (re-link by picking the file again)', () => {
  it('links the picked file and keeps the draft', async () => {
    fs.request = 'no-answer'
    const s = await load([{ name: 'a.md', content: 'my draft', saved: 'A' }])
    fs.replacement = { name: 'a.md', text: 'A on disk', lastModified: 5, handle: fileHandle('a.md') }
    expect(await s.relink(s.tab(0))).toBe(true)
    expect(s.tab(0)).toMatchObject({ access: 'linked', content: 'my draft', saved: 'A on disk' })
    expect(s.log()).toContain('[log] Linked a.md (your unsaved edits are kept)')
  })

  it('logs a cancel', async () => {
    const s = await load([{ name: 'a.md', content: 'A', saved: 'A' }])
    expect(await s.relink(s.tab(0))).toBe(false)
    expect(s.tab(0).access).toBe('needs-access')
    expect(s.log()).toContain('[log] Choose file for a.md: cancelled')
  })
})

describe('Open', () => {
  it('re-links a waiting tab when its file is opened again', async () => {
    const s = await load([{ name: 'a.md', content: 'A', saved: 'A' }, { name: 'b.md', content: 'B', saved: 'B' }])
    fs.pick = [{ name: 'b.md', text: 'B on disk', lastModified: 5, handle: fileHandle('b.md') }]
    await s.openFiles()
    expect(s.state.tabs).toHaveLength(2)
    expect(s.state.activeId).toBe('t1')
    expect(s.tab(1)).toMatchObject({ access: 'linked', content: 'B on disk' })
    expect(s.log()).toContain('[log] b.md was already open — switched to it and reconnected it')
  })

  it('opens new files and logs them; logs a cancel', async () => {
    const s = await load([])
    await s.openFiles()
    expect(s.log()).toContain('[log] Open: cancelled')
    fs.pick = [{ name: 'c.md', text: 'C', lastModified: 1, handle: fileHandle('c.md') }]
    await s.openFiles()
    expect(s.state.tabs.map((t) => t.name)).toEqual(['c.md'])
    expect(s.log()).toContain('[log] Open: picked c.md — reading…')
    expect(s.log()).toContain('[log] Opened c.md')
  })
})

describe('Save and Save as', () => {
  it('saves a waiting tab when the browser grants access, which reconnects it', async () => {
    const s = await load([{ name: 'a.md', content: 'new text', saved: 'A' }])
    expect(await s.save(s.tab(0))).toBe(true)
    expect(fs.disk.get('a.md')!.text).toBe('new text')
    expect(s.tab(0).access).toBe('linked')
    expect(s.log()).toContain('[log] Save a.md: asking the browser for access first…')
    expect(s.log()).toContain('[log] Save: saved a.md (8 characters) — and reconnected it')
  })

  it('logs an error, keeping the text, when access never comes', async () => {
    fs.request = 'no-answer'
    const s = await load([{ name: 'a.md', content: 'new text', saved: 'A' }])
    expect(await s.save(s.tab(0))).toBe(false)
    expect(s.tab(0).content).toBe('new text')
    expect(s.log().some((l) => l.startsWith("[error] Save failed — the browser didn't answer") && l.includes('Save as…'))).toBe(true)
  })

  it('Save as asks for a place, logs a cancel, then saves there', async () => {
    fs.permission = 'granted'
    const s = await load([{ name: 'a.md', content: 'A on disk', saved: 'A on disk' }])
    expect(await s.save(s.tab(0), true)).toBe(false)
    expect(s.log()).toContain('[log] Save as a.md: cancelled')
    fs.saveTarget = fileHandle('copy.md')
    expect(await s.save(s.tab(0), true)).toBe(true)
    expect(s.tab(0).name).toBe('copy.md')
    expect(fs.disk.get('copy.md')!.text).toBe('A on disk')
    expect(s.log()).toContain('[log] Save as: saved copy.md (9 characters)')
  })
})
