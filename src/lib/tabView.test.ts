import { describe, it, expect } from 'vitest'
import { getView, saveView, pruneViews, clampSelection } from './tabView'

describe('tab views', () => {
  it('remembers each tab separately and updates only the fields given', () => {
    saveView('a', { selStart: 5, selEnd: 9 })
    saveView('a', { editorTop: 300 })
    saveView('b', { previewTop: 120 })
    expect(getView('a')).toEqual({ selStart: 5, selEnd: 9, editorTop: 300, previewTop: 0 })
    expect(getView('b')).toEqual({ selStart: 0, selEnd: 0, editorTop: 0, previewTop: 120 })
  })

  it('forgets tabs that are no longer open', () => {
    saveView('c', { editorTop: 1 })
    pruneViews(['a'])
    expect(getView('a')).toBeDefined()
    expect(getView('b')).toBeUndefined()
    expect(getView('c')).toBeUndefined()
  })

  it('clamps a remembered selection to text that got shorter', () => {
    expect(clampSelection({ selStart: 50, selEnd: 80, editorTop: 0, previewTop: 0 }, 60)).toEqual([50, 60])
    expect(clampSelection({ selStart: 90, selEnd: 95, editorTop: 0, previewTop: 0 }, 60)).toEqual([60, 60])
  })
})
