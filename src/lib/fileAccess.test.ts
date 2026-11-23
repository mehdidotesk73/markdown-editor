import { describe, it, expect, vi } from 'vitest'
import { permissionOf, accessProblem } from './fileAccess'

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
})
