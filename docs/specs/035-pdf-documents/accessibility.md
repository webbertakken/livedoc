# Accessibility

**Status: specified; partly built.** Built: one landmark a page, named with its label; each page near view reading
the file's tags where they cover it, else its text as paragraphs rebuilt from the file's order, the same text Copy
gives; reading by keyboard alone, F6 between the surface's regions included. Not built: a scanned page's words,
fields and links in the tree, marks in the tree, the tree's selection, unreadable text, the text caret.

A PDF page is a picture to a browser. This spec says what makes a [PDF document](pdf-document.md) readable by a
screen reader and usable by keyboard alone, and what a written file keeps of its own accessibility. The bar is
WCAG 2.2 AA, in light and dark. The research is [Accessibility](../../research/pdf-documents/accessibility.md); the
chrome's own rules are the [office shell](../004-interface-design/office-shell.md)'s.

## The accessible tree

Each page has real DOM behind its canvas, hidden from sight and exposed to assistive technology:

| Source                     | Used when                                         | Gives                                                                                                         |
| -------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **The file's tags**        | The structure tree covers the page                | The author's own headings, paragraphs, lists, tables, figures and reading order                               |
| **Reading order rebuilt**  | The page is untagged, or its tags do not cover it | Lines and paragraphs grouped by geometry, as Editing groups them ([Editing text](editing-text.md#text-boxes)) |
| **A scanned page's words** | The page is a scan with recognised text           | The recognised words in reading order ([Scans](scans.md))                                                     |

- **One landmark a page**, a region named "Page 3 of 14", or "Page 3 of 14 (iii)" where the file gives the page a
  label of its own `(default)`; pages not near the viewport are a named, empty region until scrolled to, so the tree
  stays small and page navigation still counts them all.
- **Near the viewport** is where a page holds its picture ([Reading surface](reading-surface.md#the-pages)): the tree
  comes and goes with it `(default)`.
- **Reading order rebuilt** is the page's text in the file's own order, joined into paragraphs exactly as Copy joins a
  whole page ([Reading surface](reading-surface.md#the-pages)): one paragraph element each, after the page's
  picture, visually hidden `(default)`.
- **Tags cover a page** when the file is tagged, its structure tree reaches the page, and every drawn character of
  the page sits either in content the tree reaches or in an artifact (a page number, a running header) `(default)`.
  A page its tags do not wholly cover reads from geometry, so no text is ever left out.
- **The file's tags** read in the tree's order, not the order the page draws them; a type the file maps to a
  standard one (its role map) reads as that one; a type LiveDoc does not know reads as its content alone `(default)`.
- An element's **replacement text** (`ActualText`) reads in place of its content; its language, where the file gives
  one, is the element's own.
- A tagged element's text is its content joined as Copy joins it, its line breaks read as spaces `(default)`.
- Headings are headings at their level, a heading with no level (`H`) at level 2 `(default)`; lists are lists, tables
  are tables with their header cells, a header cell a column's header where its row holds only header cells, else a
  row's `(default)`; figures and formulas are images with their alternative text, a formula without it announced as
  "Formula" `(default)`; links are links with their target named, and **fields are real form controls**
  with the field's name (its tooltip text where the file gives one, else its name) and its required and read-only
  state.
- A figure without alternative text is announced as "Figure" and nothing more: LiveDoc never guesses a description.
- **A scanned page without recognised text** says "Page 3, a scanned page with no text. Recognise text to read it."
- **Marks are in the tree** where they sit: a highlight wraps its text ("highlighted"), a note is a button named
  "Note by Ada: first words…", a stamp an image named by its word; a mark with a comment thread says how many
  replies it has.
- The selection and the find highlight are drawn by LiveDoc on the canvas; the tree's own selection mirrors them, so
  a screen reader follows what is selected and what was found.
- Text whose font maps no characters (flagged by the engine) is announced as "unreadable text" once per run, never as
  garbage.
- The tree is built from the same text the pages' selection uses, so the two never disagree; it is rebuilt for a
  page when a live change touches it.

## Keyboard alone

Every function is reachable without a pointer ([Keyboard shortcuts](keyboard-shortcuts.md)):

- **Reading**: arrow keys scroll, Page Up and Down turn screens, the page field and the thumbnails jump; F6 moves
  between the surface's regions in screen order (title row, menu bar, toolbar, notice, rail, left panel, pages, side
  panel, page bar), ⇧F6 back.
- **A text caret** lives in the pages: with Select in hand, pressing Enter on a page (or F7 `(default)`) places a
  caret at the start of the page's text; arrow keys move it by character and line, ⌥ by word; ⇧ extends a selection;
  the mark tools then act on the selection as they do on a dragged one.
- **Marks, links and fields are a tab sequence** in reading order within each page; Enter opens a mark's thread or
  follows a link; arrow keys move a selected mark, ⌥ with arrows resizes it, Delete removes it.
- **Marks are also a list**: the comments panel lists every mark with words, and a filter lists all marks; each row
  goes to its mark and offers its actions.
- **Placing by keyboard**: a note, a stamp, a drawn signature or a text mark chosen with nothing selected lands at
  the caret, or the centre of the page in view when there is none, selected and ready to move.
- **Drawing by keyboard** is not offered: a freehand drawing needs a pointer. Lines, arrows and shapes are placed and
  sized by keys, which covers what a drawing is used for in review.
- **Fields** follow the file's tab order, or reading order where the file gives none ([Fields](fields.md#filling)).
- **Editing**: Tab moves between a page's text boxes and objects in reading order; Enter enters a text box, Escape
  leaves it; arrow keys move a selected object.
- **Organising pages**: the thumbnails are a grid; arrow keys move, Space selects, ⇧ extends, ⌘X and ⌘V move pages,
  and every page operation is in the Pages menu.
- Focus is never trapped: Escape returns from any tool, thread, text box or panel to the pages.
- Every target is at least 24 by 24 CSS pixels (44 on touch), with a visible focus ring of 3:1 against its
  surroundings in both schemes.

## Seeing

- **Zoom** to 6400% is the pages' own. The chrome reflows to 400% browser zoom at 1280 px wide; the pages, being a
  fixed layout, scroll in two directions, which WCAG's reflow criterion allows.
- **Contrast** of the chrome is the shell's tokens, AA in both schemes. Dark pages keeps every text that met 4.5:1 on
  paper at or above it ([Dark pages](dark-pages.md#accessibility)).
- **Marks never rely on colour alone**: each kind has its shape (a highlight a fill, an underline a line, a
  strikethrough a line through), and the comments panel names each by kind.
- **Forced colours**: the chrome follows the system palette; the pages are as the file says; LiveDoc's own outlines
  (selection, focus, presence) use system colours.
- **Reduced motion**: no animated scrolling, zoom easing or page turn; presence moves without easing.

## Hearing and time

- Nothing in a PDF document relies on sound. Media a file embeds is not played
  ([Parity matrix](parity-matrix.md#left-out)).
- No time limit applies to reading, filling or signing. A certificate file's password dialog never times out; the
  key is dropped when the dialog closes, not on a timer.

## What a written file keeps

| Change                              | The file's own accessibility                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Marks, comments, field values       | Untouched: an addition. Each new mark carries its words as its contents, so other readers announce it                              |
| A mark on a file that claims PDF/UA | The mark is added to the structure tree, so the claim still holds; where it cannot be, the claim is removed with a notice          |
| Edited text                         | The structure tree's link to the text is kept; where the engine cannot keep it, the claim is removed with a notice, never silently |
| Page operations                     | A deleted page takes its structure with it; a moved page keeps its own; an inserted page brings its own                            |
| Pictures added in Editing           | Offered alternative text when placed ([Objects](objects.md#pictures)); written as the figure's alternative text in a tagged file   |
| Built fields                        | Each field's tooltip is its accessible name; the builder asks for it ([Building fields](building-fields.md))                       |
| Flattening, redaction               | The flattened or removed content leaves the structure tree too                                                                     |

- LiveDoc **never claims** PDF/UA or PDF/A for a file it changed unless a validator agrees in tests
  ([Saving](saving.md#what-is-kept-untouched)).
- **Authoring accessibility** (adding tags, a reading order or a structure to an untagged file) is left out
  ([Parity matrix](parity-matrix.md#left-out)); alternative text for pictures is in.

## Share roles

Reading with assistive technology is everyone's who may read. Keyboard paths exist for every function each role has:
none is pointer-only for one level and not another.

## Limits

| Constant                    | Value | Why                                                                                                           |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `PDF_TREE_MAX_NODES_A_PAGE` | 5,000 | `(default)` Past it the rest is joined into the last paragraph; a page of plans has tens of thousands of runs |

- Tags with more elements on a page than `PDF_TREE_MAX_NODES_A_PAGE`, or nested deeper than `PDF_MAX_TREE_DEPTH`
  ([Security](security.md#limits)), read from geometry `(default)`.

## Tests

- Each corpus file with tags exposes its headings, lists, tables and figures as such; each untagged file exposes its
  text in an order a sighted reader would read it, checked on the two-column paper.
- An automated accessibility scan of the surface passes in both schemes, in each editing mode.
- A keyboard-only run opens a PDF, highlights a sentence, comments on it, fills a field, places a drawn signature and
  downloads the file.
- A baked file from a tagged corpus file still passes the validator for the claim it kept.

## Telemetry and observability

- No telemetry tells whether a person uses assistive technology.
- Fingerprints: `[pdf] tree source=<tags|geometry|recognised|none> page=<n> nodes=<n> tags=<used|absent|partial|cut>`,
  once a page's tree is built (`tags` says why a page did or did not read from its tags);
  `[pdf] page-tags-failed page=<n>` where the engine could not read a page's tags (the page reads from geometry);
  `[pdf] claim-removed
claim=<pdfua|pdfa> reason=<reason>`.
