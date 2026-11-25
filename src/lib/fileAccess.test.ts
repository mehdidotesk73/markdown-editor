import { describe, it, expect, vi } from 'vitest'
import { permissionOf, accessProblem, step } from './fileAccess'

function handle(query: PermissionState, request: () => Promise<PermissionState>) {
  return {
    name: 'notes.md',
    queryPermission: vi.fn(async () => query),
    requestPermission: vi.fn(request),
  } as unknown as FileSystemFileHandle & { queryPermission: ReturnType<typeof vi.fn>; requestPermission: ReturnType<typeof vi.fn> }
}

describe('asking the browser for access to a file', () => {
  it('only queries when not allowed to prompt', async () => {
    const h = handle('prompt', async () => 'granted')
    expect(await permissionOf(h, false)).toBe('prompt')
    expect(h.requestPermission).not.toHaveBeenCalled()
  })

  it('requests only when access is not already granted', async () => {
    const h = handle('prompt', async () => 'granted')
    expect(await permissionOf(h, true)).toBe('granted')
    expect(h.requestPermission).toHaveBeenCalledOnce()
    const g = handle('granted', () => new Promise(() => {}))
    expect(await permissionOf(g, true)).toBe('granted')
    expect(g.requestPermission).not.toHaveBeenCalled()
  })

  it('reports a prompt the browser never answers instead of waiting forever', async () => {
    vi.useFakeTimers()
    const h = handle('prompt', () => new Promise(() => {}))
    const answer = permissionOf(h, true, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await answer).toBe('no-answer')
    vi.useRealTimers()
  })

  it('says what to do for each refusal', () => {
    expect(accessProblem('a.md', 'denied')).toMatch(/refused.*Choose file/)
    expect(accessProblem('a.md', 'no-answer')).toMatch(/didn't answer.*Choose file/)
    expect(accessProblem('a.md', 'prompt')).toMatch(/dismissed.*Reconnect/)
  })

  it('gives up on a check of access that never answers, naming the step', async () => {
    vi.useFakeTimers()
    const h = { name: 'notes.md', queryPermission: () => new Promise(() => {}), requestPermission: vi.fn() } as unknown as FileSystemFileHandle
    const answer = permissionOf(h, true, 1000).catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(1000)
    expect(String(await answer)).toMatch(/Checking access to notes\.md didn't finish/)
    vi.useRealTimers()
  })

  it('rejects any file step that never settles with a StalledError', async () => {
    vi.useFakeTimers()
    const p = step(new Promise(() => {}), 'Reading', 'a.md', 500).catch((e: Error) => e)
    await vi.advanceTimersByTimeAsync(500)
    const e = (await p) as Error
    expect(e.name).toBe('StalledError')
    expect(e.message).toMatch(/^Reading a\.md didn't finish within 15 s\. .*OneDrive/)
    expect(await step(Promise.resolve(7), 'Reading', 'a.md', 500)).toBe(7)
    vi.useRealTimers()
  })
})
