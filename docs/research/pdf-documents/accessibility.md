# Accessibility

A page of a PDF is a picture to a browser. What makes it readable by a screen reader, usable by keyboard alone, and
what a written file keeps of its own accessibility. Researched November 2026. The bar is WCAG 2.2 AA.

## Reading

| Source of the accessible tree | How                                                                                                                                                                             | Verdict                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **A. The file's tags**        | A tagged PDF carries a structure tree: headings, paragraphs, lists, tables, figures with alternative text, in reading order. The engine reads it (`FPDF_StructTree_GetForPage`) | Used whenever present: it is the author's own statement             |
| **B. Reading order rebuilt**  | Untagged text grouped into lines and paragraphs by geometry, as Editing groups it ([Editing text in place](editing-text.md))                                                    | The fallback: 81 of the 104 corpus files poppler reads are untagged |
| **C. Text in content order**  | The page's text as the engine extracts it                                                                                                                                       | What the engine gives for free; two-column pages may interleave     |

- Recommended: A where the tags cover the page, B otherwise. The tree is real DOM, hidden from sight, behind the
  page's canvas: one landmark a page ("Page 3 of 14"), headings as headings, tables as tables, figures with their
  alternative text, links as links, fields as real form controls with their names.
- A scan has no text until it is recognised ([Text recognition](text-recognition.md)); until then each page says
  "Page 3, a scanned page with no text".
- The selection and the find highlight are drawn by LiveDoc ([Rendering](rendering.md)); the accessible tree mirrors
  the selection so a screen reader follows it (assumed: the pattern PDF.js uses; proven in Phase 7).

## Keyboard alone

- Every tool of Reviewing is reachable without a pointer: a text caret moves through the page's text (arrow keys,
  by word, by line), extends a selection, and the mark tools act on the selection. Acrobat does the same with its
  select tool and caret (verified: Adobe's shortcut page lists selection and comment keys).
- Marks are a list as well as a layer: the comments panel and a marks list give each mark focus, move to its page,
  and offer its actions; a mark's place can be nudged by arrow keys.
- Fields follow the file's tab order, or reading order where the file gives none.
- Placing a drawn signature or a stamp by keyboard: it lands at the caret or the focused field, then moves and
  resizes by arrow keys.
- The shell's own keys, focus rings, 24 pixel targets and reduced motion are the office shell's
  ([Office shell](../../specs/004-interface-design/office-shell.md)).

## Zoom and reflow

- WCAG's reflow criterion excepts content that needs a two-dimensional layout, which a fixed page is (assumed:
  WCAG 2.2, 1.4.10's exception). The chrome reflows at 400%; the page scrolls in two directions.
- Dark pages keeps every text and control that met 4.5:1 on paper at or above it
  ([Dark pages](dark-pages.md), verified for greys).

## What a written file keeps

| Change                        | The file's own accessibility                                                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marks, comments, field values | Untouched: an incremental update. A new mark should carry its text as `Contents` so readers announce it                                                                                                                            |
| A mark on a PDF/UA file       | PDF/UA asks every annotation to be in the structure tree; a mark LiveDoc adds is not, so the file no longer conforms. The claim is removed with a notice, or the mark is tagged (proposed: tagged, proven with veraPDF in Phase 8) |
| Edited text                   | The structure's link to the text must survive regeneration (not yet measured: the round-trip spike compared pixels, not tags)                                                                                                      |
| Page operations               | Removed pages take their structure with them; the engine's handling is measured in Phase 14                                                                                                                                        |

- LiveDoc never claims PDF/UA or PDF/A for a file it changed unless veraPDF agrees in tests
  ([The standard](the-standard.md)).
- Authoring accessibility (adding tags, alternative text, reading order to an untagged file) is Acrobat's
  accessibility tooling; whether it is in the parity matrix is F5's to settle (proposed: alternative text for
  pictures in Phase 13, the rest left out).
