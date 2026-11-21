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
| A1 | **Mermaid** | A fenced block whose info string is exactly `mermaid` (lowercase, GitHub's documented syntax) is drawn as a diagram. ```` ```Mermaid ```` stays code. | Yes |
| A2 | **Math** | `$…$` inline, `$$…$$` display, ```` ```math ```` display. A single `$` follows **Pandoc's rule**: it opens math only when followed by a non-space, and closes only when preceded by a non-space and not followed by a digit. So "The price is $5 and the other is $10" stays text, while `$a$-$b$` is two formulas. A paragraph that is only `$$ x $$` on one line is display math. | Yes (GitHub documents the syntax, not the edge rules; these are the common ones) |
| A3 | **Bullet labels** | A bullet item that starts with `{label}` shows that label as its marker: `- {1.1} Goals`. Elsewhere it reads as `• {1.1} Goals`. | Our own |
| A4 | **Numbered todos keep the number** | `3. [x] Done` shows as "3. ☑ Done". Display only; the structure is standard. | Display choice |
| A5 | **Alerts** | A **top-level** quote whose first line is exactly `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` (any case) is a coloured callout. Text on the marker line, an unknown type, or a quote nested in a list or quote stays a plain quote. | Yes (GitHub's documented syntax) |

## 3. Decisions

All decided on 2026-11-21:

- **D1:** Pandoc's `$` rule (A2).
- **D2:** a one-line `$$ x $$` on its own is display math (A2).
- **D3:** match GitHub, so `mermaid` lowercase only (A1).
- **D4:** alerts are added (A5).

GitHub's own renderer couldn't be queried from the build environment, so A1 and A5 follow GitHub's
documentation. If GitHub turns out to differ on a case, change the rule here and in `expected.ts`.
