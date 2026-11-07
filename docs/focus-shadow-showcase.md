# The Focus Shadow

*How Markdown Lab follows your attention, and how we built it.*

This document explains the focus shadow from the ground up. It is also a playground. Its sections are written in deliberately different shapes — runs of tiny sentences, sentences that go on for a long time, lists of single words, lists of whole paragraphs, nested sections — so that as you move your cursor through it, you can watch the shadow behave differently on each shape. Open it in Markdown Lab, turn the shadow on under the Preview heading, and read along.

## 1. The idea in one breath

You read. Your cursor moves. Your attention is not a point. It is a blur. It is sharpest where you are. It fades with distance. Some of it lingers behind you. The shadow is that lingering part. It trails your cursor. It marks what you just passed. It does this at four sizes. Words. Sentences. Paragraphs. Sections.

## 2. Four sizes of attention

Text is not one long string; it is nested. Words sit inside sentences, sentences inside paragraphs, paragraphs inside sections, and each of those is a different size of thing that you can be focused on. The focus shadow works at all four sizes at once, and you choose which one the preview underlines.

### 2.1 Words

The smallest unit. Every word counts the same:

- short
- medium
- extraordinarily
- a
- antidisestablishmentarianism

A long word is not harder to focus on than a short one. You take a word in at a glance, whatever its length. So on the word scale, each word is exactly one unit wide.

### 2.2 Sentences

Here length starts to matter, because a sentence is not taken in at a glance but followed from its first word to its last, and the longer it runs — the more clauses it strings together, the more qualifications it stacks up before it finally reaches its point — the more of your attention it needs before you can let it go and move on to the next one. A short one does not. You read it and you are done.

### 2.3 Paragraphs

The same is true one level up, and paragraphs can be long in two different ways:

- **Many short sentences.** A paragraph can be long because it has many sentences. Each one is easy. There are just a lot of them. You can lose your place among them.

- **A few long sentences.** A paragraph can also be long because its sentences are long, each one carrying a full idea with all of its conditions and exceptions attached, so that even two or three of them fill as much space as a dozen short ones would, and ask for a different kind of attention.

- **Both.** Most real paragraphs mix the two, and the shadow treats them according to how you choose to count them (see section 7).

### 2.4 Sections

A section is everything under a heading, down to the next heading of any level. This document has nested sections — this one, 2.4, lives inside section 2 — and each one is a unit on the section scale. Move your cursor from heading to heading with the scale set to *Sections* and the underline jumps a whole section at a time.

## 3. The ruler

To compare things of different sizes, we need one ruler for all of them. The ruler is the word.

1. Number every word in the document: 0, 1, 2, and so on.
2. Word number *i* occupies the stretch from *i* to *i + 1* on the ruler.
3. A sentence occupies the stretch of its words. A ten-word sentence is ten units long.
4. A paragraph and a section occupy the stretch of all their words.
5. Your cursor sits on the ruler too — inside a word, it sits part of the way through it.

Punctuation, list bullets and markdown symbols are not words, so they take up no room on the ruler. Code blocks count as a single sentence each.

## 4. The wave

### 4.1 A bell curve centred on the shadow

Focus is a bell curve laid along the ruler, peaking at 1 exactly where the shadow sits and fading on either side:

$$ b(x) = e^{-\frac{(x - x_0)^2}{2\sigma^2}} $$

Here $x_0$ is the shadow's position and $\sigma$ is how wide the bell is.

### 4.2 A unit's score is its average

Every word, sentence, paragraph and section gets a score: the **average** height of the bell across its length. Not the total. The average.

That one choice is what makes length matter. A short sentence near the peak sits entirely on the high part of the curve, so its average stays high. A long sentence, even one that starts right next to the peak, stretches out over the falling slopes, and its average drops. The longer it runs, the lower it scores.

The average has an exact formula — two lookups of the bell's area — so no letter-by-letter loop is ever needed.

### 4.3 A worked example

Set the intensity to 12 and put the shadow in the middle of a sentence. Now compare two neighbourhoods.

When the neighbouring sentences are short, four words each:

- the next one out scores 0.94
- the one after that, 0.80
- then 0.61
- then 0.41
- then 0.25 — below the cut-off

When the neighbouring sentences are long, twenty words each, the very next one already scores only 0.30, so the underline stays on the shadow's own sentence.

The cut-off is 0.4. With short sentences, four on each side clear it, nine in all. With long ones, none do. Same intensity, same distance from the shadow — the difference is entirely how long the sentences are.

## 5. Intensity

Intensity is the width of the bell, measured in words. Raise it and the bell spreads, more units clear the cut-off, and the underline grows.

We tried two ways of controlling the size of the underline before settling on this one:

1. **A threshold slider.** Move the cut-off itself between 0 and 1. It works, but it feels wrong: the underline's reach grows like the square root of a logarithm of the slider, so the first notch jumps, the middle crawls, and the last tenth of the slider runs off to infinity.
2. **A width slider.** Move the bell's width. The underline's reach grows in direct proportion, so every notch adds the same amount.

The width felt right, so it became *intensity*, and the cut-off is fixed at 0.4.

## 6. The shadow

The shadow is a point on the ruler that follows your cursor on a leash.

1. While your cursor moves within *distance* words of the shadow, the shadow stays where it is.
2. When your cursor gets further away than that, the shadow is pulled along, so that it stays exactly *distance* words behind.
3. This works in both directions. Read forwards and it trails behind you; read backwards and it trails behind you the other way.
4. At distance 0 the shadow sits right on your cursor.

Small back-and-forth movements, like going back a word to fix a typo, do not move the shadow at all. Only real progress through the text pulls it along.

### 6.1 From shadow to underline

Once the shadow has a position, the underline is built outward from it:

- The unit under the shadow is always included, however long it is. Otherwise a very long sentence could fail its own test and leave no underline at all.
- The underline grows to the left, one unit at a time, until it meets a unit scoring 0.4 or less.
- It does the same to the right.
- It stops at the first unit that fails, even if a unit further out would have passed, so the underline is always one unbroken stretch from point a to point b.

## 7. Linear and nested counting

How long is a paragraph? There are two honest answers, and the shadow offers both.

**Linear** counts words. A paragraph of forty words is forty units long, whether those words come as one long sentence or as ten short ones. Everything, from words to sections, is measured on the same word ruler.

**Nested** counts the next unit down. A paragraph is as long as its number of sentences, and a section is as long as its number of paragraphs. Under nested counting, a paragraph of ten short sentences is *longer* than a paragraph of one long sentence, even when they hold the same number of words.

Here are two paragraphs of almost the same number of words. To see the difference, set the scale to *Paragraphs*, the distance to 0 and the intensity to 20, then put your cursor in the second of them (the one-sentence paragraph) and switch between Linear and Nested:

- **Linear:** the underline covers both paragraphs. Counted in words, the eight-sentence paragraph is no longer than its neighbour, so it stays in focus.
- **Nested:** the eight-sentence paragraph drops out — eight sentences makes it long — and the underline reaches forward instead, over the next paragraph and the heading after it.

The first has eight short sentences. It reads in steps. Each step is small. You never get lost. But there are many steps. Each one asks for a moment. Together they add up. That is the point.

The second has just one sentence, and it reads as a single sustained movement that carries you from its opening words all the way to its close without a pause, which is a different kind of effort.

In both modes, the intensity slider still means words: on a nested ruler, it is converted using the document's average number of words per sentence, or per paragraph, so the slider feels about the same either way.

## 8. Following the cursor

The focus engine does not keep anything per tab. Instead:

- when you move the cursor or select text, the shadow and its underline are recomputed;
- when you switch to another tab, that tab's text is re-indexed and the shadow starts again on its cursor;
- when you type, the index is rebuilt once you pause for a moment, so typing stays smooth even in very large files.

### 8.1 Drawing the underline

The cursor lives in the markdown source, but the underline is drawn in the rendered preview, so the two have to be matched up. The engine lines up the words of the source with the words of the preview, in order. Markup that only exists on one side — the address inside a [link](https://example.com), the commands inside a formula — is simply skipped. Then the browser's built-in text highlighting draws a plain underline from the first word of the span to the last, without changing the preview at all.

### 8.2 How fast it is

On a document of a hundred thousand words:

- a cursor move, at all four scales, takes about **27 microseconds**;
- re-indexing after a pause in typing takes about **330 milliseconds** (about 30 milliseconds per ten thousand words);
- the underline is redrawn at most once per screen refresh.

## 9. What it is for

The underline is not decoration. It is the visible face of a set of numbers: for every unit around the shadow, at every scale, a score between 0 and 1. Those scores, and the stretch of text they cover, are what a future AI step can read — a pointer that says *look here, at this window of text, this much*. Because the shadow lags behind the cursor, that pointer settles on what you have just read, rather than chasing every keystroke.

## 10. Playground

The sections below exist only to be moved through. Try each one at each scale, and at a few intensities.

### 10.1 A run of tiny sentences

Go. Stop. Look. Wait. Read on. Turn back. Try again. Now slow. Now fast. Breathe. Keep going. Almost there. Done.

### 10.2 A run of long sentences

This sentence is long on purpose, stretching out across the line so that the bell curve has to reach a long way to cover it, which pulls its average score down. The next one does the same thing, adding clause after clause and detail after detail, so that it too sits mostly on the lower slopes of the curve. And this third one completes the set, long enough that even a generous intensity can only hold one or two of them in focus at a time.

### 10.3 A list of single words

- alpha
- bravo
- charlie
- delta
- echo
- foxtrot
- golf
- hotel

### 10.4 A list of paragraphs

1. **The first item is a paragraph.** It has three sentences. Each is short.

2. **The second item is a longer paragraph,** made of fewer but fuller sentences, each one carrying more words, so that under linear counting it is longer than the first even though it has fewer sentences.

3. **The third item is short.** Just two sentences.

### 10.5 Nested all the way down

#### 10.5.1 A small section

One paragraph. Two short sentences.

#### 10.5.2 Another small section

Also small. With a list:

- one
- two

##### 10.5.2.1 Deeper still

The deepest section in this document. Move between the headings here with the scale set to *Sections* and watch the underline step from one to the next.

### 10.6 A mix

A short sentence. Then a much longer one that wanders on for a while before it finally makes its point, and only then lets you go. Short again.

- a list in the middle of it all
- with a second item that runs on a little longer than the first one does

And a closing paragraph, back to normal length, to finish the tour.
