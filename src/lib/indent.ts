// Tab / Shift+Tab in the editor: indent or outdent whole lines.
//
// With a selection spanning one or more lines, Tab indents every line it
// touches and Shift+Tab outdents them; the selection keeps covering the same
// text. A selection ending at the very start of a line doesn't include that
// line. With no selection, Tab inserts an indent at the cursor and Shift+Tab
// outdents the cursor's line. Pure: returns the edit to apply.

export const INDENT = '  '

export interface IndentEdit {
  /** Replace text[from, to) with `insert`, then select [selStart, selEnd). */
  from: number
  to: number
  insert: string
  selStart: number
  selEnd: number
}

/** How many leading characters one outdent removes from a line: a tab, or up to INDENT.length spaces. */
function outdentWidth(line: string): number {
  if (line.startsWith('\t')) return 1
  let n = 0
  while (n < INDENT.length && line[n] === ' ') n++
  return n
}

export function indentEdit(text: string, start: number, end: number, outdent: boolean): IndentEdit {
  // Plain Tab with no selection: insert the indent at the cursor.
  if (start === end && !outdent) {
    return { from: start, to: end, insert: INDENT, selStart: start + INDENT.length, selEnd: start + INDENT.length }
  }

  const blockStart = text.lastIndexOf('\n', start - 1) + 1
  // A selection that ends at column 0 of a line stops before that line.
  const last = end > start && (end === 0 || text[end - 1] === '\n') ? end - 1 : end
  const nl = text.indexOf('\n', last)
  const blockEnd = nl < 0 ? text.length : nl

  const lines = text.slice(blockStart, blockEnd).split('\n')
  let shiftFirst = 0
  let shiftTotal = 0
  const out = lines.map((line, i) => {
    let next: string
    if (outdent) {
      const w = outdentWidth(line)
      next = line.slice(w)
      if (i === 0) shiftFirst = -Math.min(w, start - blockStart)
      shiftTotal -= w
    } else {
      // Empty lines stay empty.
      next = line.length ? INDENT + line : line
      const d = next.length - line.length
      if (i === 0) shiftFirst = d
      shiftTotal += d
    }
    return next
  })
  const insert = out.join('\n')
  const selStart = Math.max(blockStart, start + shiftFirst)
  const selEnd = start === end ? selStart : Math.max(selStart, end + shiftTotal)
  return { from: blockStart, to: blockEnd, insert, selStart, selEnd }
}
