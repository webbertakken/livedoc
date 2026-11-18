# Standard mapping

**Status: specified.** Nothing is built.

How a [text document](text-document.md) maps onto its two native formats (fork C1, ruled: both native): **ODF** 1.4
part 3's text document (`office:text`) and **OOXML**, ISO/IEC 29500 WordprocessingML (`w:document`). It says which
constructs the one model holds and where each sits in either format, how what the model does not hold survives a round
trip, the conformance LiveDoc claims, ODF's flat form, conversion between the two, and the limits. The containers
around them (zip, manifests and relationships, metadata, pictures) are the shared
[Office packages](../020-import-export/office-packages.md). The research is
[Standard](../../research/docs-open-standard/standard.md).

## The rule

**A file opened and saved with no edit in between gives the same document, in the same format**: every construct the
model holds comes back equal, every construct it keeps comes back byte-equal, and nothing else is dropped silently.
Each difference a round trip makes is a row of [Documented losses](#documented-losses); the corpus tests prove there
are no others. A text document only changes format when a person converts it ([Conversion](#conversion)).

## What the model holds

| Construct            | ODF                                                                                                                                                                                                                                                            | OOXML                                                                                                                                                | In the model                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Paragraphs, headings | `text:p`, `text:h` (`text:outline-level` 1 to 10)                                                                                                                                                                                                              | `w:p` with `w:pStyle`; heading level from the style's `w:outlineLvl` 0 to 8                                                                          | Paragraph with a style; Heading 1 to 6; deeper levels kept as Heading 6 with the level kept                               |
| Runs                 | `text:span`; `text:s`, `text:tab`, `text:line-break`                                                                                                                                                                                                           | `w:r` with `w:rPr`; `w:t`, `w:tab`, `w:br`                                                                                                           | Runs with formatting; spaces, tabs and line breaks as characters                                                          |
| Text formatting      | `style:font-name`, `fo:font-size`, `fo:font-weight`, `fo:font-style`, `style:text-underline-*`, `style:text-line-through-*`, `style:text-position`, `fo:color`, `fo:background-color`, `fo:font-variant`, `fo:text-transform`                                  | `w:rFonts`, `w:sz`, `w:b`, `w:i`, `w:u`, `w:strike`, `w:vertAlign`, `w:color`, `w:highlight` / `w:shd`, `w:smallCaps`, `w:caps`                      | Font, size, bold, italic, underline, strikethrough, superscript, subscript, colour, highlight, small caps, capitalisation |
| Paragraph formatting | `fo:text-align`, `fo:margin-*`, `fo:text-indent`, `fo:line-height`, `style:line-height-at-least`, `fo:keep-with-next`, `fo:keep-together`, `fo:widows`, `fo:orphans`, `fo:border*`, `fo:padding*`, `fo:background-color`, `style:tab-stops`, `fo:break-before` | `w:jc`, `w:ind`, `w:spacing`, `w:keepNext`, `w:keepLines`, `w:widowControl`, `w:pBdr`, `w:shd`, `w:tabs`, `w:pageBreakBefore`                        | Alignment, indents, spacing, keep rules, borders, shading, tab stops, breaks                                              |
| Paragraph styles     | `style:style` family `paragraph`, `style:parent-style-name`, `style:next-style-name`, `style:default-style`                                                                                                                                                    | `w:style` `w:type="paragraph"` in `styles.xml`, `w:basedOn`, `w:next`, `w:docDefaults`                                                               | Normal text, Title, Subtitle, Heading 1 to 6; other named styles kept and applied                                         |
| Lists                | `text:list`, `text:list-item`, `text:list-style` and its level styles, `text:continue-numbering`, `text:continue-list`, `text:start-value`                                                                                                                     | `w:numPr` (`w:numId`, `w:ilvl`) into `numbering.xml` (`w:abstractNum`, `w:num`, `w:lvlOverride`)                                                     | Bulleted, numbered and checklist lists, nine levels, restart and continue                                                 |
| Checklists           | No element: a `☐` / `☑` bullet, checked state in `livedoc:checked`                                                                                                                                                                                             | `w14:checkbox` content control (Word 2010+) around the item's box                                                                                    | A checklist item, checked or not                                                                                          |
| Sections, page setup | `style:master-page`, `style:page-layout`, `text:section` with `style:columns`                                                                                                                                                                                  | `w:sectPr` (`w:pgSz`, `w:pgMar`, `w:cols`, `w:type`, `w:titlePg`), `w:background`                                                                    | Page setup per section; columns; page colour                                                                              |
| Headers and footers  | `style:header`, `style:footer`, `-first`, `-left`                                                                                                                                                                                                              | `w:headerReference` / `w:footerReference` (`default`, `first`, `even`), `w:evenAndOddHeaders`                                                        | Header and footer, different first page, different odd and even                                                           |
| Fields               | `text:page-number`, `text:page-count`, `text:date`, `text:title`, `text:bookmark-ref`                                                                                                                                                                          | `w:fldSimple`, `w:fldChar` with `PAGE`, `NUMPAGES`, `DATE`, `TITLE`, `REF`                                                                           | Page number, page count, date, title, heading links                                                                       |
| Footnotes            | `text:note` `text:note-class="footnote"` / `"endnote"`                                                                                                                                                                                                         | `w:footnoteReference`, `w:endnoteReference` into `footnotes.xml`, `endnotes.xml`                                                                     | Footnotes; endnotes kept and shown at the end                                                                             |
| Tables               | `table:table`, columns, rows, cells, spans, `table:covered-table-cell`, `table:table-header-rows`, `style:may-break-between-rows`                                                                                                                              | `w:tbl`, `w:tblGrid`, `w:tr`, `w:tc`, `w:gridSpan`, `w:vMerge`, `w:tblHeader`, `w:cantSplit`                                                         | Tables with merged cells, header rows, borders, shading, padding, alignment                                               |
| Pictures             | `draw:frame` with `draw:image`, size, `text:anchor-type`, `style:wrap`, `fo:clip`, `draw:transform`, `svg:title`, `svg:desc`                                                                                                                                   | `w:drawing` with `wp:inline` / `wp:anchor`, `pic:pic`, `a:blip` (relationship), `a:srcRect`, `a:xfrm` `rot`, `wp:docPr` `descr`                      | Pictures in line, wrapped or fixed; size, crop, rotation, alt text                                                        |
| Drawings             | `draw:image` (SVG, PNG fallback) and `livedoc:drawing`                                                                                                                                                                                                         | `a:blip` (PNG, `asvg:svgBlip` SVG) and `livedoc:drawing` in an `mc:AlternateContent` choice                                                          | A LiveDoc canvas drawing ([Objects](objects.md#drawings))                                                                 |
| Equations            | `draw:object` holding MathML                                                                                                                                                                                                                                   | `m:oMath`, `m:oMathPara` (OMML)                                                                                                                      | Equations                                                                                                                 |
| Links, bookmarks     | `text:a`, `text:bookmark`, `-start`, `-end`                                                                                                                                                                                                                    | `w:hyperlink` (relationship or `w:anchor`), `w:bookmarkStart`, `w:bookmarkEnd`                                                                       | Links, bookmarks, heading links                                                                                           |
| Table of contents    | `text:table-of-content`                                                                                                                                                                                                                                        | A `TOC` field in a `w:sdt` with `w:docPartGallery` "Table of Contents"                                                                               | A table of contents with links or page numbers                                                                            |
| Horizontal line      | A paragraph with a bottom border and no text                                                                                                                                                                                                                   | A paragraph with a `w:pBdr` bottom border and no text                                                                                                | Horizontal line                                                                                                           |
| Comments             | `office:annotation`, `office:annotation-end`, `office:name`; replies and resolved `loext:parent-name`, `loext:resolved`                                                                                                                                        | `w:commentRangeStart`, `-End`, `w:commentReference` into `comments.xml`; threads and done in `commentsExtended.xml` (`w15:paraIdParent`, `w15:done`) | Comment threads with replies and resolved state ([Review](review.md))                                                     |
| Suggestions          | `text:tracked-changes`, `text:changed-region` with `text:insertion`, `text:deletion`, `text:format-change`, `office:change-info`; `text:change-start`, `-end`, `text:change`                                                                                   | `w:ins`, `w:del`, `w:rPrChange`, `w:pPrChange` with `w:author`, `w:date`                                                                             | Suggestions, attributed and dated ([Review](review.md))                                                                   |
| Metadata             | `office:meta`: `dc:title`, `dc:creator`, dates, `meta:document-statistic`, `dc:language`                                                                                                                                                                       | `docProps/core.xml` (`dc:title`, `dc:creator`, dates), `docProps/app.xml` (statistics), `w:lang`                                                     | Name, dates, author, language, statistics written on save                                                                 |

## Extensions

What Google Docs does and neither standard has an element for is written in LiveDoc's extension namespace,
`urn:livedoc:xmlns:text:1.0` (`livedoc:`), which ODF's extended conformance and OOXML's markup compatibility
(`mc:Ignorable`) let other readers ignore, each with a plain fallback any suite shows:

| Construct                        | Written as                                                                                          | Fallback another suite shows        |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Reactions, assignee on a comment | `livedoc:reactions`, `livedoc:assignee` on the comment                                              | The comment's text                  |
| Document tabs                    | `livedoc:tab-*` on a top-level ODF `text:section`, or a section break with `livedoc:tab-*` in OOXML | The tabs' writing one after another |
| Pageless                         | `livedoc:pageless` and the text width in the document's settings                                    | Pages                               |
| Drawings                         | `livedoc:drawing` beside the drawing's picture                                                      | The picture                         |

Smart chips are left out (fork C3, ruled): a chip in an arriving file is read as its shown text, and its other data is
kept ([Kept content](#kept-content)).

## Kept content

A file can hold what the model does not: other suites' extensions, form controls and content controls, database and
mail-merge fields, indexes other than the table of contents, smart chips, embedded objects other than equations, custom
shapes and text boxes, and constructs of newer versions of either standard.

- **Kept, untouched, in its own format.** Each such construct is stored where it stood, as its XML (and any package
  entry it needs, with its relationship), with the paragraph or table it sat in, and written back byte-equal while that
  paragraph is not edited. In the editor it shows as a grey placeholder with its name ("Form control, kept from the
  file"), which can be selected, copied, moved and deleted, never edited.
- **Edited around.** Typing in a paragraph that holds a kept construct keeps it in its place among the characters.
- **Styles and settings** the model does not read are kept whole, on the style or the document they belong to.
- **Gone when its anchor is.** Deleting the paragraph that holds a kept construct deletes it, as any content.
- **Never carried across formats.** Converting a text document drops its kept content, listed before the conversion
  runs ([Conversion](#conversion)).

## Conformance

- **ODF**: LiveDoc writes ODF 1.4 extended conformance, `office:version="1.4"`, valid against the strict 1.4 schema
  once the `livedoc:` and `loext:` namespaces and kept foreign content are removed.
- **OOXML**: LiveDoc writes ISO/IEC 29500 Transitional, as Word does, with `livedoc:` declared in `mc:Ignorable`; valid
  against the Transitional schemas once ignorable namespaces and kept content are removed.
- Every file LiveDoc writes is validated in CI against its own format's schema
  ([Office packages](../020-import-export/office-packages.md#validation)).
- Read: ODF 1.0 to 1.4, conforming or extended; OOXML Transitional and Strict, and Word's `.docm` with its macros
  dropped ([Import security](files-and-print.md#import-security)).

## The flat file

- An ODF text document may leave as the package (`.odt`, the default) or the **flat file** (`.fodt`): one XML document
  holding everything, pictures as base64. Repository sync writes the flat file, so `git diff` and `rg` read it as text
  ([Agents and sync](agents-and-sync.md#repository-sync)).
- OOXML has no standard flat form: an OOXML text document syncs as its `.docx` bytes.
- Writing is **deterministic** in both formats: the same model writes the same bytes. Attributes in a fixed order,
  automatic styles named by a hash of their properties, block elements on their own lines with two-space indentation
  and nothing added inside a paragraph (so whitespace in text never changes), `\n` line endings, ODF's base64 in
  76-character lines, fixed zip entry order and timestamps.

## Conversion

- **Only by a person's choice**: File > Convert to Word format, or Convert to OpenDocument format, for an Editor.
- **Losses first.** The dialog lists what the other format cannot hold before anything changes: kept content (by
  name and count) and each construct of [Documented losses](#documented-losses) present in this document. **Convert**
  runs it as one undo step; **Cancel** leaves it.
- **Downloading in the other format** writes a converted copy with the same losses listed in the download's report;
  the text document keeps its format.
- Recorded on the document's [timeline](../013-workspace/timeline.md); `Document · Changed · TextDocumentConverted`.

## Documented losses

Each loss by direction; each is listed in the import, conversion or download report, never silent.

| From                     | Loss                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Either format, edited    | A kept construct inside an edited paragraph keeps its XML but loses any automatic style the edit reshaped        |
| Either format            | Heading levels past 6 show as Heading 6 (the level is kept and written back)                                     |
| ODF to OOXML             | Kept content; ODF-only list and page features the mapping table marks (to be completed per construct in Phase 5) |
| OOXML to ODF             | Kept content, content controls other than checkboxes, OMML equations become MathML                               |
| LiveDoc to another suite | Reactions, assignees, document tabs and pageless show as their fallbacks                                         |

## Limits

| Constant                     | Value     | Why                                                                                 |
| ---------------------------- | --------- | ----------------------------------------------------------------------------------- |
| `TEXT_DOCUMENT_MAX_CHARS`    | 1,020,000 | Google's limit ([Text document](text-document.md#limits))                           |
| `PACKAGE_MAX_BYTES`          | 100 MB    | (default) An import's file; past it, `package_too_large` before inflating           |
| `PACKAGE_MAX_INFLATED_BYTES` | 200 MB    | (default) The byte budget across every entry of one import, the zip-bomb guard      |
| `PACKAGE_MAX_ENTRIES`        | 5,000     | (default) Entries in one package                                                    |
| `KEPT_CONTENT_MAX_BYTES`     | 1 MB      | (default) Kept content per text document; past it, the rest is dropped and reported |
