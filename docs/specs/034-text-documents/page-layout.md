# Page layout

**Status: partly built.** Page setup, page orientation, pageless, the page drawn at its setup and laying out onto
pages are built; the rest is specified.

Pages, sections, breaks, columns, headers and footers, page numbers and footnotes in a [text document](text-document.md).
The layout is drawn by the measured DOM layout the research recommends
([Layout engine](../../research/docs-open-standard/layout-engine.md)), and print and PDF reuse it.

## Page setup

File > Page setup, a dialog with two tabs, **Pages** and **Pageless**:

- **Pages**: apply to (whole document, this section, this point forward); orientation (portrait, landscape); paper size
  (Letter, Tabloid, Legal, Statement, Executive, Folio, A3, A4, A5, B4, B5; and any size a file brings); page colour
  (the one colour picker); margins top, bottom, left, right (cm or in); **Set as default** (stored with the person) and
  **OK**.
- **Pageless**: background colour; **Set as default**; **OK**.
- A new text document's page setup: the person's default, else Letter in the United States and Canada and A4
  elsewhere by the browser's locale, margins 1 in (2.54 cm), white, portrait (assumed: Google's defaults; confirmed with
  the captures).

The Pages tab, rule by rule:

- **Paper sizes**, portrait, as Google lists them: Letter 8.5 × 11 in, Tabloid 11 × 17 in, Legal 8.5 × 14 in,
  Statement 5.5 × 8.5 in, Executive 7.25 × 10.5 in, Folio 8.5 × 13 in, A3 297 × 420 mm, A4 210 × 297 mm, A5 148 × 210
  mm, B4 250 × 353 mm, B5 176 × 250 mm. Each option reads its name and size in the person's unit.
- The paper shown is the one the page has either way round, to within half a point (a file's rounding). A size a file
  brings that is none of them shows as **Custom** with its size, first in the list, and is kept until another is picked.
- **Orientation**: landscape lays the paper's longer side across. Switching swaps the page's width and height and keeps
  the margins as they are (assumed: Google's).
- **Margins** are shown and typed in the person's unit, as indents are (inches where the browser's language is
  American English, centimetres elsewhere; two decimals). A field takes 0 to 55.88 cm (22 in), else "Enter a number
  from 0 to 55.88." Left and right together leave the text at least 1 in (72 pt) wide, top and bottom at least 1 in
  high, else both fields of the pair read "Margins leave too little room for text." (default) While any field is
  refused, OK is held.
- **Page colour**: the one colour picker in its swatch skin, with the office colour rows; white is stored as no
  colour, so the file writes none.
- **Apply to**: until sections are built the dialog applies to the whole document and the field is not shown. A file
  that brings section breaks has every section's paper, orientation and margins set; the page colour is the whole
  document's in both formats.
- **OK** applies what changed as one undo step and returns focus to the writing; nothing changed changes nothing.
  **Cancel** and Escape change nothing.
- **Set as default** keeps the tab's paper, orientation, margins and colour as the person's default page setup, in
  their [preferences](../007-editor/user-preferences.md) as default styles are; the dialog stays open, the button reads
  **Saved as default** until a field changes, and a polite live region says so (default). It changes no document.
- **A new text document starts in its maker's default page setup**, the first time its maker opens it in the browser
  tab that made it, as default styles do ([Default styles](text-and-paragraphs.md#default-styles)): their default, else
  the locale's paper (A4 outside the United States and Canada). Never an undo step. A file opened keeps its own setup;
  someone else's new document keeps its maker's.
- A saved default that does not read back as a page setup is ignored whole and logged
  `[text-document] default page setup unreadable`.

Format > **Page orientation** is a small dialog of the two orientations, applying to the whole document as Page
setup's does, one undo step (assumed: Google's).

- **The page is drawn at its setup**: its paper's width and height, its margins and its colour (the first section's
  until sections are built); the ruler's margins set the same values ([Editing surface](editing-surface.md#the-ruler)).
  A page colour is drawn as a fill is on the paper it is on: as written in the light scheme, its lightness mirrored on
  dark paper ([The page in the dark scheme](editing-surface.md#the-page-in-the-dark-scheme)); the writing's inks are
  drawn for the paper, not for the page colour, as Google draws them on white (default). Margins dragged on the ruler:
  `Tab · Changed · TextDocumentMargins`.

## Print layout

View > Show print layout on: pages with gaps between them, headers, footers and footnotes drawn. Off: one column with
page breaks shown as lines, no headers or footers. Per person.

## Pageless

Format > Switch to pageless format: the document has no pages, breaks, headers, footers, page numbers or columns (they
are kept, hidden, and come back when switched back); pictures may be wider than the text; wide tables scroll. View >
Text width: narrow, medium, wide, full (per person). Printing and PDF of a pageless document lay it on pages with the
pages' setup.

- **Pageless is the document's**, shared by everyone on it, as the paper is: Format > **Switch to pageless format**
  turns it on, and the same item reads **Switch to pages format** while it is on; one undo step either way. The tab
  chosen in Page setup is the format OK leaves the document in (Google's), so Page setup is the other way to switch.
- The **Pageless tab** holds **Background colour**: the page colour, the same value the Pages tab sets, so a colour
  outlives a switch either way (default); OK there changes only the colour and the format, leaving what the Pages tab
  holds as the document has it; **Set as default** keeps the person's default as pageless with that colour,
  and a new document they make starts pageless.
- **Drawn pageless**: no sheet and no grey ground; the background colour (or the paper's white or dark) fills the
  document's whole area, and the writing is a centred column at the text width, 8 in (576 pt) wide at medium, never
  wider than the window less 0.5 in each side (default: medium until View > Text width is built), with 0.5 in above
  the first line (default). The page setup's margins and paper are kept, unused, for printing and for switching back.
- **The ruler pageless** spans the column: indents and tab stops as on a page, no margins to drag.
- In the file: [Extensions](standard-mapping.md#extensions); another suite shows the document on its pages.

## Laying out

- **The pages**: the writing is laid onto pages one under another, centred on the ground, 12 px apart at 100% zoom
  (default), 24 px of ground above the first and below the last; each page a sheet of its paper, its page colour and
  a light shadow; the last page is a whole page however little it holds. Each page has the setup of the section its
  first line belongs to (the first section's until sections are built).
- **A page fills** with lines from the top of its text area (the page less its margins) down; a line that would cross
  the foot of the text area starts the next page. Lines break by the paragraph's alignment and the browser's line
  breaking, so a paragraph that does not fit breaks **between two of its lines**, never inside one.
- A paragraph's space before is kept at the top of a page; its space after never pushes a line onto the next page
  (assumed: Google's).
- **Prevent single lines** (widows and orphans of two): a paragraph never leaves its first line alone at a page's
  foot nor its last line alone at a page's head; the lines move on to the next page in pairs.
- **Keep lines together**: a paragraph that does not fit where it starts moves whole to the next page.
- **Keep with next**: a paragraph moves to the next page with the paragraph after it when that one starts there; a run
  of paragraphs keeping with the next moves as one. Headings keep with the next paragraph by default.
- A keep rule gives way when keeping it would leave a page empty: a paragraph, or a run kept together, taller than a
  page, or already at a page's top, breaks where the page fills.
- **Page break before**: a paragraph that has it starts a new page, unless it is already at a page's top.
- A **section break** that starts its section on the next page starts a new page after its line; on an odd or even
  page (a file's), it leaves the page between blank when the next page is the wrong one. A continuous one breaks no
  page.
- Content kept from a file, drawn as a placeholder, and a section break's line move whole.
- Pictures in line move with their line; wrapped and fixed ones keep their position on the page and the text flows
  round them.
- **No pages** are laid out when the document is pageless or on a phone, where the writing flows to the window
  ([Editing surface](editing-surface.md#phone-and-tablet)); a page break is then a break in the column only.
- The layout is **incremental**: an edit measures only the paragraphs it changed, lays out from the page holding the
  paragraph before the first of them, and stops at the first page that starts where it started before, so typing on
  page 300 costs what typing on page 1 does ([Performance](#performance)). A change of text width, styles, the
  document's default text or loaded fonts measures every paragraph again.
- **What is read**: the space between pages is drawn, never text; a screen reader reads the writing as one, the caret
  moves across a page's end as across a line's, and Backspace or Delete at a page's edge deletes the character on the
  other side.
- Logs: `[text-document] layout` with the pages, the paragraphs measured, the page laid from and where it settled, and
  the time it took.

## Breaks

- Insert > Break: **Page break** (⌘Enter, Ctrl+Enter elsewhere), **Section break (next page)**, **Section break
  (continuous)** and **Column break**, which is dimmed while the section has one column, as Google's
  ([Columns](#columns)).
- **A page break** ends the paragraph at the caret, a selection replaced, and starts the rest on a new page: the new
  paragraph has its own **page break before**, which is how both formats hold one (`fo:break-before="page"`,
  `w:pageBreakBefore`). At a paragraph's start the paragraph moves to the new page and an empty one stays behind.
- **Format > Line & paragraph spacing > Add page break before** is a switch beside the keep rules, on for every
  paragraph the selection touches unless all have it, then off for all, as Google's (2021).
- **Backspace** at the start of a paragraph with its own page break before takes the break away and nothing else, one
  undo step; the next Backspace joins as ever. **Delete** at the end of the paragraph before it does the same.
- **A section break** ends the paragraph at the caret and puts the break between the two halves: the new section
  starts on the next page or continues the page, with the page setup of the section the caret was in.
- **Drawn**: in print layout a page break is the new page and a section break shows nothing. With non-printing
  characters shown, or where no pages are laid out (pageless, a phone), each shows as a dotted line with its name,
  **Page break** above its paragraph, **Section break (next page)** or **Section break (continuous)** on its own line,
  in the muted ink of the non-printing characters: never text, never read by a screen reader; a section break is
  selected and deleted whole.
- A Word file's page break inside a paragraph (`w:br` of the page type, kept as the file has it) starts a new page at
  the line after it, or before the next paragraph when nothing follows it; a column break is a line break until
  columns are built.
- A section has its own page setup, columns, headers and footers and page numbering.
- Share roles: an Editor inserts and removes breaks; a Participant and a Viewer see none of the items.

## Columns

Format > Columns: one, two or three; **More options**: count (1 to 3), spacing (cm or in), **Line between columns**.
Per section. Text fills the first column down the page, then the next.

## Headers and footers

- Insert > Headers and footers, or a double-click in the top or bottom margin, puts the caret in the header or footer.
- **Options**: header and footer margins; **Different first page**; **Different odd and even**; per section, linked to
  the previous section's by default (**Link to previous** in the header's own bar).
- A header holds any text, pictures, tables and fields. Escape or a press on the body leaves it.

## Page numbers

Insert > Page numbers: four presets (top or bottom, with or without the first page); **More options**: position
(header or footer), show on first page, start at (continue from the previous section or a number). Page count as a
field too.

## Footnotes

- Insert > Footnote (⌘⌥F) puts a numbered mark at the caret and the caret in its note at the foot of the page.
- Numbered 1, 2, 3 through the document; drawn below a short rule at the foot of the page their mark falls on,
  continuing on the next page when long.
- Endnotes in an arriving file are kept and drawn at the document's end.

## Watermark and line numbers

Neither exists in Google Docs' menus for text documents today (assumed); a watermark or line numbering in an arriving
file is kept and drawn where the format holds it.

## Performance

| Budget                                   | Value                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Keystroke to painted character, any page | 16 ms at the 75th percentile on the reference laptop (set in Phase 4) |
| Re-layout after a paste of 10 pages      | 100 ms                                                                |

(default) Both are confirmed against the tracer bullet's measurements in Phase 4.

## Share roles

Editors change page setup, breaks, columns, headers, footers, page numbers and footnotes; a Participant only as
suggestions (D7); a Viewer chooses print layout and text width for themself. Until suggestions are built a
Participant and a Viewer see neither Page setup nor Page orientation.

## Telemetry

`Tab · Changed · TextDocumentPageSetup`, `TextDocumentPageOrientation`, `TextDocumentPageless`, `TextDocumentColumns`, `TextDocumentHeaderFooter`;
`Element · Added · TextDocumentBreak<Kind>` (`Page`, `SectionNextPage`, `SectionContinuous`), `TextDocumentFootnote`,
`TextDocumentPageNumbers`; Add page break before is a keep rule (`Element · Changed · TextDocumentKeepRule`);
`UI · Changed · TextDocumentPageDefault` when Set as default keeps one, before it is kept. Never text.
