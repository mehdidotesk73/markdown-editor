import { describe, it, expect } from 'vitest'
import { marked } from './markdownParser'

describe('mermaid blocks', () => {
  it('become a placeholder carrying the escaped source as code (not in an attribute)', () => {
    const html = marked.parse('```mermaid\nflowchart TD\nA["x < y"] --> B\n```\n') as string
    expect(html).toContain('<div class="mermaid-block"><pre><code>flowchart TD\nA[&quot;x &lt; y&quot;] --&gt; B</code></pre></div>')
  })
  it('leave other code blocks alone', () => {
    expect(marked.parse('```js\nx()\n```\n') as string).toContain('<pre><code class="language-js">x()')
  })
})
