# Rendering rules

What a markdown document **should** render as. The conformance run (`npm run conformance`) grades
every renderer against these rules automatically. Expected output is computed, not hand-written:

> **expected = our additions applied to the reference rendering**

## 1. Baseline: the standard, as GitHub renders it

- **CommonMark + GFM** (tables, task lists, strikethrough, bare-URL autolinks). This is what
  GitHub, and for the core syntax VS Code, render.
- **Reference renderer:** micromark with its GFM and math extensions, which passes the CommonMark
  and GFM test suites. Calibrated against the GFM spec's own examples: 596 / 606 match. The 10
  misses are where the 2019 spec text is older than today's rules (see `SCORECARD.md`).
- **Out of scope:** raw HTML. The app sanitises HTML away, and the fixture doesn't test it.

What the baseline settles, among others:

- **Nesting.** A child must be indented to its parent's text column: 2 spaces under `- `,
  3 under `1. `, 4 under `10. `.
- **Loose vs tight lists.** A blank line between items makes the whole list loose: each item is a
  paragraph, with paragraph spacing.
- **List markers.** Only `-` `*` `+` and `1.` / `1)` are list markers. `a.`, `A)`, `i.`, `1.1`
  and `(a)` are text.
- **Changing marker.** A different bullet character or delimiter starts a new list.
- **Code fences inside list items** follow the same indentation rules as any other content.

## 2. Our additions

Each addition only gives meaning to text the standard leaves as plain code or plain text. None of
them changes how a standard document is structured.

| # | Addition | Rule | Same as GitHub? |
|---|---|---|---|
| A1 | **Mermaid** | A fenced block whose info string is `mermaid` is drawn as a diagram. | Yes |
| A2 | **Math** | `$…$` is inline math, `$$…$$` is display math, and a ```` ```math ```` block is display math. | Yes |
| A3 | **Bullet labels** | A bullet item that starts with `{label}` shows that label as its marker: `- {1.1} Goals`. Elsewhere it reads as `• {1.1} Goals`. | Our own |
| A4 | **Numbered todos keep the number** | `3. [x] Done` shows as "3. ☑ Done". This is display only; the structure is standard. | Display choice |

## 3. Decisions still open

These cases have more than one reasonable answer. Until they are decided, the expected output
follows the reference.

- **D1. When does `$` start math?** The reference treats "The price is $5 and the other price
  is $10" as math (MATH-004). The rule Pandoc uses would keep it as text: `$` opens math only if
  the next character isn't a space, and `$` closes it only if the character before isn't a space
  and the character after isn't a digit. That rule also gives the expected result for
  `$a$-$b$` (MATH-013).
- **D2. One-line `$$ x $$`.** The reference renders this as inline math (MATH-003). It could
  instead be display math when it stands alone on its line.
- **D3. ```` ```Mermaid ```` with a capital M** (MMD-028): diagram or plain code?
- **D4. GitHub alerts.** `> [!NOTE]` is a plain quote in the standard; GitHub draws a coloured
  callout. Add it as an A5, or keep the standard?
