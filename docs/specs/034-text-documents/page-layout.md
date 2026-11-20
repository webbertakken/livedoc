# Page layout

**Status: partly built.** The page is drawn at the first section's width and margins, set on the ruler; the rest is
specified.

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

- **The page is drawn at its setup**: its paper's width and its margins (the first section's until sections are
  built); the ruler's margins set the same values ([Editing surface](editing-surface.md#the-ruler)). Margins dragged on
  the ruler: `Tab · Changed · TextDocumentMargins`.

## Print layout

View > Show print layout on: pages with gaps between them, headers, footers and footnotes drawn. Off: one column with
page breaks shown as lines, no headers or footers. Per person.

## Pageless

Format > Switch to pageless format: the document has no pages, breaks, headers, footers, page numbers or columns (they
are kept, hidden, and come back when switched back); pictures may be wider than the text; wide tables scroll. View >
Text width: narrow, medium, wide, full (per person). Printing and PDF of a pageless document lay it on pages with the
pages' setup.

## Laying out

- Lines break by the paragraph's alignment and the browser's line breaking; a paragraph that does not fit at a page's
  foot breaks between lines, honouring keep with next, keep together and widow and orphan control.
- Headings keep with the next paragraph by default.
- Pictures in line move with their line; wrapped and fixed ones keep their position on the page and the text flows
  round them.
- The layout is **incremental**: an edit re-lays from its paragraph onward and stops once page boundaries settle, so
  typing on page 300 costs what typing on page 1 does ([Performance](#performance)).

## Breaks

- **Page break** (⌘Enter); **section break (next page)**; **section break (continuous)**; **column break**.
- Shown as a line with its name when print layout is off or non-printing characters are shown.
- A section has its own page setup, columns, headers and footers and page numbering.

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
suggestions (D7); a Viewer chooses print layout and text width for themself.

## Telemetry

`Tab · Changed · TextDocumentPageSetup`, `TextDocumentPageless`, `TextDocumentColumns`, `TextDocumentHeaderFooter`;
`Element · Added · TextDocumentBreak<Kind>`, `TextDocumentFootnote`, `TextDocumentPageNumbers`. Never text.
