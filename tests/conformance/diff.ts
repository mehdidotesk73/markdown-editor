/** A line diff (longest common subsequence): " " same, "-" only in a, "+" only in b. */
export function lineDiff(a: string, b: string): string {
  const x = a.split('\n')
  const y = b.split('\n')
  const n = x.length
  const m = y.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      out.push(`  ${x[i++]}`)
      j++
    } else if (j < m && (i >= n || lcs[i][j + 1] >= lcs[i + 1][j])) out.push(`+ ${y[j++]}`)
    else out.push(`- ${x[i++]}`)
  }
  return out.join('\n')
}
