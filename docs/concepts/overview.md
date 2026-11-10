# About Markdown Lab

## What is this app?

A markdown editor for files on **your own computer**. The app runs entirely in your browser — your files are never uploaded anywhere. Open a `.md` file, edit it with a live preview beside it, and save it back where it came from.

## How do I use it?

- **Open** a markdown file from your computer. It opens in its own tab. Open more files to get more tabs — each tab is linked to its own file.
- **Write on the left, read on the right.** The preview updates as you type. Drag the line between the two panes to resize them.
- **Focus modes:** click **⇤** on the Markdown pane to hide the editor and read the document full-width. Click **⇥** on the Preview pane to hide the preview and write full-width. Click the thin bar on the side to bring a pane back.
- **Save** (or `Ctrl/⌘ S`) writes your changes back to the file on your computer. A tab with unsaved changes shows its name in amber, and the Save button's icon turns amber.
- **New file** (＋ on the tab bar, or Ctrl/⌘ Alt N) opens a new document that starts with the guide to Markdown Lab and the focus shadow — read it, or select all and replace it with your own text. The first Save asks where to put the file.
- **Export PDF** downloads the document as a PDF straight away. The text in it is real (you can select and search it), pages never cut a line in half, and formulas are typeset. The first export takes a moment longer while the PDF tools and fonts load; after that they're kept for offline use too. The small arrow beside **Export PDF** picks the PDF's font — **Sans**, **Serif** or **Mono** — and remembers it. Code blocks in the PDF sit on a soft cream panel; long lines wrap inside it, and a long block carries on over the page break.
- **Lettered lists:** lines starting `a)` `b)` `c)` (or `A.` `B.` `C.`) become a lettered list, as long as they start at *a* and go in order.
- **Dark / Light** (top bar) switches the whole app between your dark look and your light look. The arrow beside it opens all the looks — dark: Navy & Brass, Graphite, Midnight & Champagne; light: Porcelain, Fog. Every look uses the same serif for titles and headings. Picking one makes it your look for that mode, and it's remembered.
- **Math:** write LaTeX between dollar signs — `$x^2$` inside a sentence, or `$$ E = mc^2 $$` for a formula on its own line.

## The focus

As you move through your text, a field of **attention** follows the cursor, and the preview
**underlines** the stretch of text that holds most of it (60%). It's a quiet guide to what you're
reading or writing, and the basis for future features that look at your text with you. Nearby
text gets more attention than far text, and short sentences or paragraphs get more than long ones.

The **Focus** button sits at the top right of the Preview pane. Its eye shows whether the focus
is on (eye) or off (crossed-out eye). It starts off. Click it to drop down the focus settings; click it again to
close them — the focus keeps running either way:

- The **eye** button in the panel turns the focus itself on or off.
- **Words / Sentences / Paragraphs / Sections** chooses what gets underlined.
- **Decay** sets how far attention reaches, in words: higher spreads it wider, so more is
  underlined. Each scale remembers its own decay, so you can tune each one separately.
- **Lag** makes the focus follow the path your cursor has taken, that many steps behind, counted
  in the scale you're viewing: 2 on Sentences means the sentence you were in two sentences ago,
  wherever that was. At 0 (the default) the focus follows your cursor live.
- The **counter** on the right shows how many words, sentences, paragraphs or sections are in
  focus right now.

The underline needs a recent browser (Chrome, Edge, Safari 17.2+, Firefox 140+).

To see every effect, open the guide *Focus* (`docs/focus-shadow-showcase.md` in the project) and move through it.

**Shortcuts:** `Tab` / `⇧ Tab` indent / outdent the selected lines · `Ctrl/⌘ S` save · `Ctrl/⌘ ⇧ S` save as · `Ctrl/⌘ O` open · `Ctrl/⌘ P` export PDF · `Ctrl/⌘ \` hide/show editor · `Ctrl/⌘ ⇧ \` hide/show preview.

## Common Questions

**Q: Which browsers can save straight to my file?**

A: Chrome, Edge, Brave, Arc and Opera on a computer. Safari, Firefox and phone browsers can't write to files on your device, so there **Save** downloads a copy of the file instead.

**Q: I reloaded the page and see "Reconnect". Why?**

A: For your security the browser forgets permission to a file when the page reloads. Your tabs and any unsaved text are kept — click **Reconnect** and allow access, and saving works again.

**Q: I edited the file in another app. Will the editor see it?**

A: Yes — when you switch back to the editor it re-reads the file. If you also had unsaved changes in that tab, your changes are kept and the tab stays marked unsaved.

**Q: An image is missing from my PDF.**

A: Images from the web are included when the site that hosts them allows it. Some sites block other pages from copying their images; the PDF then shows the image's description in its place.

**Q: Images in my markdown don't show.**

A: Images from the web (`https://…`) show. Images referenced by a path on your computer (like `./pic.png`) can't be loaded by the browser.

**Q: Why is my change not showing?**

A: This is a progressive web app (PWA), which means it caches itself to work offline. If a new version was published but you see an old one, tap "Reload latest" in the footer.

**Q: Can I use this offline?**

A: Yes. Once you've opened the app once, it's cached locally and keeps working without internet.

**Q: How do I report a bug?**

A: Tap **View logs** in the footer, then **Copy log**, and send it along with a screenshot.

**Q: What data is stored on my device?**

A: Your open tabs, unsaved text, and links to the files you opened are stored in your browser so nothing is lost if the page closes. Nothing is sent anywhere.
