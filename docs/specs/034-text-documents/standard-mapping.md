# Standard mapping

**Status: in progress.** The model's paragraphs, runs, links, styles, lists, tab stops and sections, kept content,
conversion and the documented losses are built in both formats; every other construct of the table below is kept
content until the phase that builds it.

How a [text document](text-document.md) maps onto its two native formats (fork C1, ruled: both native): **ODF** 1.4
part 3's text document (`office:text`) and **OOXML**, ISO/IEC 29500 WordprocessingML (`w:document`). It says which
constructs the one model holds and where each sits in either format, how what the model does not hold survives a round
trip, the conformance LiveDoc claims, ODF's flat form, conversion between the two, and the limits. The containers
around them (zip, manifests and relationships, metadata, pictures) are the shared
[Office packages](../020-import-export/office-packages.md). The research is
[Standard](../../research/docs-open-standard/standard.md). The code is one DOM-free package, `@livedoc/text-documents`, on
the office packages' `@livedoc/office-packages`.

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

## The model

The model is plain values in `@livedoc/text-documents`, each a namespace of pure functions over immutable data.

- **`TextDocument`**: its format, metadata, styles, lists, the first section's setup, the body, and its kept parts.
- **Body**: blocks in order, each a **paragraph**, a **section break** or a **kept block**.
- **`Paragraph`**: a paragraph style by id, direct paragraph formatting, a list place (list, level 0 to 8, checked),
  and inlines: **runs** (characters with direct text formatting and an optional link) and **kept inlines**.
- **`Style`**: a named paragraph or text style, its parent and next style, its formatting; the built-in styles are
  known by role (Normal text, Title, Subtitle, Heading 1 to 6) in either format's names.
- **`ListDefinition`**: nine levels, each bullet (with its character), numbered (with its format, its label pattern
  and its start) or checklist; paragraphs of one list number on across anything between them.
- **`SectionBreak`**: starts a section, on a new page or continuous, with its page setup (paper, orientation,
  margins, page colour) and columns.
- **Paragraph borders**: up to five lines (top, bottom, left, right, between), each a width, a dash (solid, dotted,
  dashed) and a colour, with its padding (the space to the text); and a background colour. ODF: `fo:border-<side>`
  (`0.06pt solid #000000`), `fo:padding-<side>` and `fo:background-color` on the paragraph properties, every side
  written once any is set (`none` where absent); OOXML: `w:pBdr` (`w:sz` in eighths of a point, `w:space` in
  points, `w:val` `single`, `dotted` or `dashed`, `nil` where absent) and `w:shd` (`w:fill`). Other line
  styles read as the nearest dash (double as solid).
- **Tab stops**: a paragraph's or a style's list, replacing the style's whole, each a position from the text area's
  start, an alignment (start, centre, end, decimal with its character) and a leader (dot, hyphen, underscore, middle
  dot); and the document's default interval. ODF: `style:tab-stops` in the paragraph properties (`style:position`,
  `style:type` with `char` for decimal, `style:char`, `style:leader-text`), `style:tab-stop-distance` on the default
  style. ODF positions count from the paragraph's indent unless `settings.xml` sets `TabsRelativeToIndent` false
  (LibreOffice's default is relative): read, the paragraph's indent (its own, its list level's, else its style's) is
  added; written, taken off, and a paragraph whose indent differs from its style's writes the stops it draws with as its
  own, so LibreOffice draws them where LiveDoc does. A text document made in LiveDoc writes `TabsRelativeToIndent`
  false. OOXML: `w:tabs` (`w:val` `start`/`left`, `center`, `end`/`right`, `decimal`, `clear`; `w:pos` in twentieths
  of a point from the margin; `w:leader`), merged down the style chain as Word does, so a paragraph's or style's list is
  its style's with its `clear`s taken away and its own added; written back as that difference. The interval is
  `w:defaultTabStop` in `settings.xml`.
- Lengths are points, read from either format's units and rounded to three decimals; colours are `#rrggbb`.
- Text holds tabs as `\t` and line breaks as `\n`.

## Extensions

What Google Docs does and neither standard has an element for is written in LiveDoc's extension namespace,
`urn:livedoc:xmlns:text:1.0` (`livedoc:`), which ODF's extended conformance and OOXML's markup compatibility
(`mc:Ignorable`) let other readers ignore, each with a plain fallback any suite shows:

| Construct                        | Written as                                                                                          | Fallback another suite shows                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Reactions, assignee on a comment | `livedoc:reactions`, `livedoc:assignee` on the comment                                              | The comment's text                                       |
| Document tabs                    | `livedoc:tab-*` on a top-level ODF `text:section`, or a section break with `livedoc:tab-*` in OOXML | The tabs' writing one after another                      |
| Pageless                         | ODF: config item `livedoc:pageless` (boolean) in a `livedoc:settings` set in `settings.xml`; OOXML: `<livedoc:pageless/>` in `w:settings` | Pages                                                    |
| Drawings                         | `livedoc:drawing` beside the drawing's picture                                                      | The picture                                              |
| Checklist without strikethrough  | `livedoc:strike-checked="false"` on its list levels (ODF level styles, OOXML `w:lvl`)               | A checklist struck through or not as that suite draws it |

Smart chips are left out (fork C3, ruled): a chip in an arriving file is read as its shown text, and its other data is
kept ([Kept content](#kept-content)).

## Kept content

A file can hold what the model does not: other suites' extensions, form controls and content controls, database and
mail-merge fields, indexes other than the table of contents, smart chips, embedded objects other than equations, custom
shapes and text boxes, and constructs of newer versions of either standard.

- **Four grains of keeping.** A **kept block** is a body-level element the model does not map (a table until tables
  are built, a table of contents); a **kept inline** is one inside a paragraph (a bookmark, a field, a note, a picture),
  with the formatting of the run it sat in; **kept properties** are the file's own formatting element of a paragraph,
  run, style, list or section, written back as it was while the model's values read from it are unchanged, and
  rebuilt from the model, its unmapped children kept, once they change; **kept parts** are the package's other
  entries (pictures, themes, settings, headers, notes), written back with their relationships and media types.
- **Namespaces travel.** Kept XML carries the namespace bindings it needs; the document's root keeps the arriving
  root's declarations and OOXML's ignorable list, so kept content reads as it did.
- **Relationship ids stay.** An OOXML relationship keeps its id; a new one (a link) is numbered after the highest kept
  one, in order of first use, and a link to a target a kept relationship already names reuses its id.
- **Kept, untouched, in its own format.** Each such construct is stored where it stood, as its XML (and any package
  entry it needs, with its relationship), with the paragraph or table it sat in, and written back byte-equal while that
  paragraph is not edited. In the editor it shows as a grey placeholder with its name ("Form control, kept from the
  file"), which can be selected, copied, moved and deleted, never edited.
- **Shown as it reads** (default): a kept construct with nothing to see (declarations, bookmark and comment markers,
  proofing marks, soft page breaks) takes no room on the page, and a kept line break breaks the line; the rest show as
  the placeholder. The list is `keptPresenceOf` in `@livedoc/text-documents`.
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
| ODF to OOXML             | Kept content (by name and count); lowercase and capitalised text transforms (only uppercase has a Word property) |
| ODF to OOXML             | Continuous sections' own names and their protection                                                              |
| ODF to OOXML             | A border's padding past 31 pt is written as 31 pt, Word's most                                                   |
| OOXML to ODF             | The line between paragraphs (`w:pBdr/w:between`): an OpenDocument file has none                                  |
| Word files               | Bar and list tab stops (`w:val` `bar`, `num`) read as no stop; a heavy leader reads as an underline              |
| Either format            | Tab stops past 64 in a paragraph or past 22 in either way                                                        |
| ODF files, relative tabs | LibreOffice counts default tab stops from the indent; LiveDoc from the margin, as Word and Google do             |
| Either format            | Border styles the model has no dash for (double, wave, 3-D) read as solid; padding on a side with no border      |
| OOXML to ODF             | Kept content (by name and count), content controls other than checkboxes, OMML equations become MathML           |
| Either format, converted | Unmapped formatting inside kept properties (theme colours and fonts, revision ids): the model's values stay      |
| Word files               | Proofing marks (`w:proofErr`) and last-rendered page breaks: Word recomputes them on open                        |
| ODF files                | Soft page breaks (`text:soft-page-break`): layout hints every suite recomputes                                   |
| ODF files                | Nested sections are written back one after another, each with its own columns                                    |
| LiveDoc to another suite | Reactions, assignees, document tabs and pageless show as their fallbacks                                         |

## Limits

| Constant                     | Value     | Why                                                                                                                       |
| ---------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `TEXT_DOCUMENT_MAX_CHARS`    | 1,020,000 | Google's limit ([Text document](text-document.md#limits))                                                                 |
| `PACKAGE_MAX_BYTES`          | 100 MB    | (default) An import's file; past it, `package_too_large` before inflating                                                 |
| `PACKAGE_MAX_INFLATED_BYTES` | 200 MB    | (default) The byte budget across every entry of one import, the zip-bomb guard                                            |
| `PACKAGE_MAX_ENTRIES`        | 5,000     | (default) Entries in one package                                                                                          |
| `KEPT_CONTENT_MAX_BYTES`     | 1 MB      | (default) Kept XML per text document (blocks and inlines, not package entries); past it, the rest is dropped and reported |
| `PICTURE_MAX_PIXELS`         | 100 M     | (default) A picture's width times height, read from its header; past it, `picture_too_large`                              |
